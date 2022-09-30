import dayjs from 'dayjs';
import CertUtils from '@/certUtils';

import fs from 'fs-extra';
import path from 'path';

const pathToCertificates = path.join(__dirname, '../kes/cert/');
fs.ensureDirSync(pathToCertificates);

const ca = CertUtils.createRootCA(dayjs().add(1, 'y').toDate());

const privateCert = CertUtils.createHostCert(new Date(), 'localhost', [
    'localhost',
    '127.0.0.1'
], ca);

fs.writeFileSync(path.join(pathToCertificates, 'root.crt'), ca.certificate.toString());
fs.writeFileSync(path.join(pathToCertificates, 'root.key'), ca.privateKey.toString());

fs.writeFileSync(path.join(pathToCertificates, 'client.crt'), privateCert.certificate.toString());
fs.writeFileSync(path.join(pathToCertificates, 'client.key'), privateCert.privateKey.toString());
