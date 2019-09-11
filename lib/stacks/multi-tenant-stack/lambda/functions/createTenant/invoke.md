aws lambda invoke --function-name arn:aws:lambda:eu-west-1:060732430353:function:saas-identity-stack-CognitoAdminCreateUserED4DB9FD-B3I8OIGKA4LE --payload file://event.json output.txt

sam local invoke CreateTentantEFAAE2F8 -e "./lib/lambda/tenantManagement/createTenant/event.json" --force-image-build --layer-cache-basedir "./cdk.out"

docker run -it --entrypoint=/bin/bash samcli/lambda:nodejs10.x-8c6e5910d3dbeb5af7a89621a -i

Layer ARN:
arn:aws:lambda:eu-west-1:060732430353:layer:commonnpmmodules7A9A106F:3
