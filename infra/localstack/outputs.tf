output "s3_bucket_name" {
  value = aws_s3_bucket.uploads.bucket
}

output "sqs_queue_url" {
  value = aws_sqs_queue.scan.url
}

output "cognito_user_pool_id" {
  value       = var.enable_cognito ? aws_cognito_user_pool.league[0].id : null
  description = "Cognito user pool id (if enabled)."
}

output "cognito_user_pool_client_id" {
  value       = var.enable_cognito ? aws_cognito_user_pool_client.league_web[0].id : null
  description = "Cognito app client id (if enabled)."
}

output "cognito_jwks_url" {
  value       = var.enable_cognito ? "${var.localstack_endpoint}/cognito-idp/${var.aws_region}/${aws_cognito_user_pool.league[0].id}/.well-known/jwks.json" : null
  description = "LocalStack JWKS URL (if enabled)."
}
