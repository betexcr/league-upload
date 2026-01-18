terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region                      = var.aws_region
  access_key                  = var.aws_access_key_id
  secret_key                  = var.aws_secret_access_key
  s3_use_path_style           = true
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  skip_region_validation      = true

  endpoints {
    s3          = var.localstack_endpoint
    sqs         = var.localstack_endpoint
    cognitoidp  = var.localstack_endpoint
  }
}

resource "aws_s3_bucket" "uploads" {
  bucket = var.s3_bucket_name
}

resource "aws_sqs_queue" "scan" {
  name = var.sqs_queue_name
}

resource "aws_cognito_user_pool" "league" {
  count = var.enable_cognito ? 1 : 0
  name  = var.cognito_user_pool_name
}

resource "aws_cognito_user_pool_client" "league_web" {
  count         = var.enable_cognito ? 1 : 0
  name          = var.cognito_user_pool_client_name
  user_pool_id  = aws_cognito_user_pool.league[0].id
  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  supported_identity_providers = ["COGNITO"]
}
