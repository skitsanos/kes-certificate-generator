# kes-certificate-generator
Self-signed certificate generation for MinIO Kes 


```shell
export KES_SERVER=https://localhost:7373
export KES_CLIENT_KEY=kes/cert/client.key
export KES_CLIENT_CERT=kes/cert/client.cert


curl -sSL --tlsv1.3 --key ./kes/cert/client.key --cert ./kes/cert/client.cert -X POST 'https://localhost:7373/v1/key/list'
```