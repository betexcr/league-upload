variable "localstack_endpoint" {
  type        = string
  description = "LocalStack endpoint URL."
  default     = "http://localhost:4566"
}

variable "aws_region" {
  type        = string
  description = "AWS region used by LocalStack."
  default     = "us-east-1"
}

variable "aws_access_key_id" {
  type        = string
  description = "Access key for LocalStack."
  default     = "test"
}

variable "aws_secret_access_key" {
  type        = string
  description = "Secret key for LocalStack."
  default     = "test"
}

variable "s3_bucket_name" {
  type        = string
  description = "S3 bucket name."
  default     = "league-uploads"
}

variable "sqs_queue_name" {
  type        = string
  description = "SQS scan queue name."
  default     = "scan-queue"
}

variable "enable_cognito" {
  type        = bool
  description = "Whether to provision Cognito resources in LocalStack."
  default     = false
}

variable "cognito_user_pool_name" {
  type        = string
  description = "Cognito user pool name."
  default     = "league-uploads"
}

variable "cognito_user_pool_client_name" {
  type        = string
  description = "Cognito user pool client name."
  default     = "league-web"
}
