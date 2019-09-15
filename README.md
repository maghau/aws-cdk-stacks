# Stacks

Each stacks provides constructs that builds that particular stack from the ground up. Usually constructs under a stack are unique to that stack, and cannot be generalized and put into the common folders

## Root stack

The root stack provides global resources such as VPC's.

## Identity-stack

This stack creates a multi-tenant setup based on Cognito and can be used as a base for providing such features to other stacks.

## Common

Constructs that can be re-used across stacks go here.

# Useful commands

-   `npm run build` compile typescript to js
-   `npm run watch` watch for changes and compile
-   `cdk deploy` deploy this stack to your default AWS account/region
-   `cdk diff` compare deployed stack with current state
-   `cdk synth` emits the synthesized CloudFormation template

# statemachine template (tenant onboarding)

`{ "StartAt": "CreateTenantStep", "States": { "CreateTenantStep": { "Next": "CreateTenantAdminStep", "Type": "Task", "Resource": "arn:aws:lambda:eu-west-1:060732430353:function:multi-tenant-stack-CreateTenant12B55F2C-1W456UWPH4JCM", "ResultPath": "$.createTenantResult" }, "CreateTenantAdminStep": { "Next": "AddUserToCognitoGroupStep", "InputPath": "$.adminDetails", "Type": "Task", "Resource": "arn:aws:lambda:eu-west-1:060732430353:function:multi-tenant-stack-CognitoCreateUser33B05316-1IOCDK3GROY0Q", "ResultPath": "$.createAdminUserResult" }, "AddUserToCognitoGroupStep": { "End": true, "Type": "Task", "Resource": "arn:aws:lambda:eu-west-1:060732430353:function:multi-tenant-stack-CognitoAddUserToGroupBE4EA189-1P9Q85IOVHUXK", "Parameters": { "username.$": "$.createAdminUserResult.body.User.Username", "groupName": "TenantAdmins"}, "ResultPath": "$.addUserToGroupResult" } }, "TimeoutSeconds": 60 }`

Test input:
`{ "name": "XTS", "address": "", "postCode": "", "city": "", "region": "", "country": "", "phoneNumber": "+4796623946", "parentTenantId": "", "adminDetails": { "name": "Magnus Haugaasen", "email": "magnus.haugaasen@gmail.com", "phoneNumber": "+4796623946" } }`
