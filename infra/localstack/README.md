# LocalStack Terraform

This module provisions LocalStack resources that mirror AWS services used by the app.

What it creates
- S3 bucket for uploads
- SQS queue for scan jobs
- Optional Cognito user pool + app client

Prereqs
- LocalStack running on `http://localhost:4566`
- Terraform 1.5+

Usage
```bash
cd infra/localstack
terraform init
terraform apply
```

Enable Cognito in LocalStack
```bash
terraform apply -var="enable_cognito=true"
```

Use outputs to set API envs:
- `SQS_SCAN_QUEUE_URL`
- `AWS_S3_BUCKET`
- `COGNITO_JWKS_URL` (if enabled)

Example API envs for LocalStack
```
USE_LOCALSTACK=true
LOCALSTACK_ENDPOINT=http://localhost:4566
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
SQS_SCAN_QUEUE_URL=http://localhost:4566/000000000000/scan-queue
AWS_S3_BUCKET=league-uploads
LOCAL_STORAGE=false
AUTH_MODE=cognito
COGNITO_JWKS_URL=http://localhost:4566/cognito-idp/us-east-1/<POOL_ID>/.well-known/jwks.json
```
