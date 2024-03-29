import {md, pki, random, util} from 'node-forge';
import dayjs from 'dayjs';
import {existsSync, readFileSync} from 'fs-extra';
import {X509Certificate} from 'crypto';
import {isIP} from 'net';

const makeNumberPositive = hexString =>
{
    let mostSignificativeHexDigitAsInt = parseInt(hexString[0], 16);

    if (mostSignificativeHexDigitAsInt < 8)
    {
        return hexString;
    }

    mostSignificativeHexDigitAsInt -= 8;
    return mostSignificativeHexDigitAsInt.toString() + hexString.substring(1);
};

// Generate a random serial number for the Certificate
const randomSerialNumber = () => makeNumberPositive(util.bytesToHex(random.getBytesSync(20)));

// Get the Not Before Date for a Certificate (will be valid from 2 days ago)
const getCertNotBefore = (): Date => dayjs().subtract(1, 'd').toDate();

// Get Certificate Expiration Date (Valid for 90 Days)
const getCertNotAfter = (notBefore: string | Date): Date =>
{
    const expDate = dayjs(notBefore);
    if (expDate.isAfter(new Date()))
    {
        return expDate.toDate();
    }

    return dayjs().endOf('day').toDate();
};

const DEFAULT_C = 'Israel';
const DEFAULT_ST = 'IL';
const DEFAULT_L = 'Tel Aviv';

export interface CertificateDetails
{
    certificate: string,
    privateKey: string,
    encrypted?: boolean,
    notBefore: Date,
    notAfter: Date
}

class CertUtils
{
    static createRootCA(validUntil?: Date, password?: string): CertificateDetails
    {
        // Create a new Keypair for the Root CA
        const {
            privateKey,
            publicKey
        } = pki.rsa.generateKeyPair(2048);

        // Define the attributes for the new Root CA
        const attributes = [{
            shortName: 'C',
            value: DEFAULT_C
        },
            {
                shortName: 'ST',
                value: DEFAULT_ST
            },
            {
                shortName: 'L',
                value: DEFAULT_L
            },
            {
                shortName: 'O',
                value: 'Skitsanos'
            },
            {
                shortName: 'OU',
                value: 'DevOps'
            },
            {
                shortName: 'CN',
                value: 'Development RootCA'
            }];

        const extensions = [
            {
                name: 'basicConstraints',
                cA: true
            }
        ];

        // Create an empty Certificate
        const cert = pki.createCertificate();

        // Set the Certificate attributes for the new Root CA
        cert.publicKey = publicKey;
        cert.privateKey = privateKey;
        cert.serialNumber = randomSerialNumber();
        cert.validity.notBefore = getCertNotBefore();
        cert.validity.notAfter = getCertNotAfter(validUntil || dayjs().add(30, 'd').toDate());
        cert.setSubject(attributes);
        cert.setIssuer(attributes);
        cert.setExtensions(extensions);

        // Self-sign the Certificate
        cert.sign(privateKey, md.sha256.create());

        // Convert to the PEM format
        const pemCert = pki.certificateToPem(cert);

        const pemKey = !password ? pki.privateKeyToPem(privateKey) : pki.encryptRsaPrivateKey(privateKey, password);

        const {
            notBefore,
            notAfter
        } = cert.validity;

        // Return the PEM encoded cert and private key
        return {
            certificate: pemCert,
            privateKey: pemKey,
            ...!!password && {encrypted: true},
            notBefore,
            notAfter
        };
    }

    static createHostCert(validUntil: Date, commonName: string, validDomains: string[], rootCAObject: CertificateDetails, rootPassword?: string): CertificateDetails
    {
        if (!commonName.toString().trim())
        {
            throw new Error('"commonName" must be a String');
        }
        if (!Array.isArray(validDomains))
        {
            throw new Error('"validDomains" must be an Array of Strings');
        }
        if (rootCAObject && (Object.hasOwn(rootCAObject, 'encrypted') && !rootPassword))
        {
            throw new Error('The root password is missing');
        }
        if (!rootCAObject || !Object.hasOwn(rootCAObject, 'certificate') || !Object.hasOwn(rootCAObject, 'privateKey'))
        {
            throw new Error('"rootCAObject" must be an Object with the properties "certificate" & "privateKey"');
        }

        // Convert the Root CA PEM details, to a forge Object
        const caCert = pki.certificateFromPem(rootCAObject.certificate);
        const caKey = !(rootPassword && rootCAObject.encrypted) ? pki.privateKeyFromPem(rootCAObject.privateKey) : pki.decryptRsaPrivateKey(rootCAObject.privateKey, rootPassword);

        // Create a new Keypair for the Host Certificate
        const hostKeys = pki.rsa.generateKeyPair(2048);

        // Define the attributes/properties for the Host Certificate
        const attributes = [{
            shortName: 'C',
            value: DEFAULT_C
        }, {
            shortName: 'ST',
            value: DEFAULT_ST
        }, {
            shortName: 'L',
            value: DEFAULT_L
        }, {
            shortName: 'CN',
            value: commonName
        }];

        const extensions = [
            {
                name: 'basicConstraints',
                critical: true,
                cA: false
            },
            {
                name: 'keyUsage',
                critical: true,
                digitalSignature: true,
                keyEncipherment: true
            },
            {
                name: 'extKeyUsage',
                serverAuth: true
            }, {
                name: 'authorityKeyIdentifier',
                authorityCertIssuer: true,
                keyIdentifier: caCert.serialNumber
            },
            {
                name: 'subjectAltName',
                altNames: validDomains.map(address =>
                {
                    return isIP(address) ? {
                        type: 7,
                        ip: address
                    } : {
                        type: 2,
                        value: address
                    };
                })
            }
        ];

        // Create an empty Certificate
        const newHostCert = pki.createCertificate();

        // Set the attributes for the new Host Certificate
        newHostCert.publicKey = hostKeys.publicKey;
        newHostCert.serialNumber = randomSerialNumber();
        newHostCert.validity.notBefore = getCertNotBefore();
        newHostCert.validity.notAfter = getCertNotAfter(validUntil || dayjs().add(30, 'd').toDate());
        newHostCert.setSubject(attributes);
        newHostCert.setIssuer(caCert.subject.attributes);
        newHostCert.setExtensions(extensions);

        // Sign the new Host Certificate using the CA
        newHostCert.sign(caKey, md.sha512.create());

        // Convert to the PEM format
        const pemHostCert = pki.certificateToPem(newHostCert);
        const pemHostKey = pki.privateKeyToPem(hostKeys.privateKey);

        const {
            notBefore,
            notAfter
        } = newHostCert.validity;

        return {
            certificate: pemHostCert,
            privateKey: pemHostKey,
            notBefore,
            notAfter
        };
    }

    static getAltNames = (path: string): string =>
    {
        if (existsSync(path))
        {
            return new X509Certificate(readFileSync(path)).subjectAltName;
        }

        throw new Error('Path not found');
    };
}

export default CertUtils;