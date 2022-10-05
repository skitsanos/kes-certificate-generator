import dayjs from 'dayjs';
import CertUtils from '@/certUtils';

import fs from 'fs-extra';
import path from 'path';

const pathToCertificates = path.join(__dirname, '../kes/cert/');
fs.ensureDirSync(pathToCertificates);

const validUntil = dayjs().add(1, 'y').toDate();

const ca = CertUtils.createRootCA(validUntil);

const privateCert = CertUtils.createHostCert(validUntil, 'localhost', [
    'localhost',
    '127.0.0.1'
], ca);

fs.writeFileSync(path.join(pathToCertificates, 'root.crt'), ca.certificate.toString());
fs.writeFileSync(path.join(pathToCertificates, 'root.key'), ca.privateKey.toString());

fs.writeFileSync(path.join(pathToCertificates, 'client.crt'), privateCert.certificate.toString());
fs.writeFileSync(path.join(pathToCertificates, 'client.key'), privateCert.privateKey.toString());

console.log(CertUtils.getAltNames(path.join(pathToCertificates, 'client.crt')));
