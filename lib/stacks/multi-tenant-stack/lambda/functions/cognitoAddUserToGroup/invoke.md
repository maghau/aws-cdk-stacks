aws lambda invoke --function-name arn:aws:lambda:eu-west-1:060732430353:function:saas-identity-stack-CognitoAdminCreateUserED4DB9FD-B3I8OIGKA4LE --payload file://event.json output.txt

sam local invoke CreateNewTentant94303E25 -e event.json
