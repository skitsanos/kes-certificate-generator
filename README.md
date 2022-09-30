# kes-certificate-generator
Self-signed certificate generation for MinIO KES 

> KES is a stateless and distributed key-management system for high-performance applications. We built KES as the bridge between modern applications - running as containers on [Kubernetes](https://kubernetes.io/) - and centralized KMS solutions. Therefore, KES has been designed to be simple, scalable, and secure by default. It has just a few knobs to tweak instead of a complex configuration and does not require a deep understanding of secure key management or cryptography. More details about KES can be found here: https://blog.min.io/introducing-kes/

### Generating certificates

Minimal code example for generating root and client certificates for MinIO KES server. The example below will generate a set of the certificates with a validity of one year:

```typescript
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
```

Once certificates are generated, you need to enlist `root` certificate and its key under `tls` section of the KES configuration file:

```yaml
tls:
  key: /etc/kes/cert/root.key
  cert: /etc/kes/cert/root.crt
```

### Checking certificate validity with OpenSSL

To test the `root` certificate validity with OpenSSL, execute the following:

```shell
openssl x509 -noout -in /etc/kes/cert/root.crt -enddate
```

Or for the client certificate:

```shell
openssl x509 -noout -in /etc/kes/cert/client.crt -enddate
```

### Getting certificate identity

Once the certificates are created, you need to enlist the client certificate identity in the KES server config file; you can find the configuration example at this repo in `kes/config/config.yml`. To get the certificate identity, run this command:

```shell
kes identity of /etc/kes/cert/client.crt
```

An example:

```yaml
policy:
  my-app:
    allow:
      - /v1/key/*/*
    identities:
      - 59b25f1b844225b56a2b2fa4f3e6d6c218ee8204201dbf1e535ff32dab9fd300
```

### Running KES server with custom configuration

In order to run KES server with your custom configuration with the new self-signed certificates you've created, you can run the following command:

```shell
kes server --config /etc/kes/config/config.yml --auth off
```

In case if you are running KES server in Docker, you can use the following `docker-compose.yml` file:

```yaml
version: "3.9"

services:
  kes-server:
    container_name: kes-dev
    image: "minio/kes"
    ports:
      - "7373:7373"
    volumes:
      - ./cert/:/etc/kes/cert
      - ./config/:/etc/kes/config
    command: "server --config /etc/kes/config/config.yml --auth off"
```

### Testing client certificates

To test the certificate, for example to list all the keys on KES server:


```shell
export KES_SERVER=https://localhost:7373
export KES_CLIENT_KEY=/etc/kes/cert/client.key
export KES_CLIENT_CERT=/etc/kes/cert/client.crt

curl -sSL --tlsv1.3 -k --key /etc/kes/cert/client.key --cert /etc/kes/cert/client.crt -X GET 'https://localhost:7373/v1/key/list/*'

#or with kes CLI:

kes key ls -k
```