import {
    UserPool,
    CfnUserPoolGroup,
    CfnIdentityPool,
    SignInType,
    UserPoolClient,
    CfnUserPool,
} from '@aws-cdk/aws-cognito';
import {
    Function,
    LayerVersion,
    Runtime,
    Code,
    AssetCode,
    EventSourceMapping,
    StartingPosition,
} from '@aws-cdk/aws-lambda';
import { Vpc, SubnetType, SecurityGroup } from '@aws-cdk/aws-ec2';
import {
    Table,
    BillingMode,
    AttributeType,
    StreamViewType,
} from '@aws-cdk/aws-dynamodb';
import {
    Role,
    ServicePrincipal,
    ManagedPolicy,
    PolicyStatement,
    Effect,
    Policy,
} from '@aws-cdk/aws-iam';

import { Task, StateMachine, State } from '@aws-cdk/aws-stepfunctions';
import { InvokeFunction } from '@aws-cdk/aws-stepfunctions-tasks';
import {
    RestApi,
    CfnAuthorizer,
    AwsIntegration,
    PassthroughBehavior,
    AuthorizationType,
} from '@aws-cdk/aws-apigateway';
import { CfnDomain } from '@aws-cdk/aws-elasticsearch';
import {
    PhysicalName,
    Stack,
    Construct,
    StackProps,
    Duration,
} from '@aws-cdk/core';
import { EbsDeviceVolumeType } from '@aws-cdk/aws-autoscaling';
import path = require('path');

import { DynamoEventSource } from '@aws-cdk/aws-lambda-event-sources';

export class MultiTenantStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        /* ##########################################################
         * ######### VPC
         * ##########################################################
         */

        const vpc = new Vpc(this, 'saas-demo-vpc', {
            cidr: '10.0.0.0/16',
            maxAzs: 2,
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'public',
                    subnetType: SubnetType.PUBLIC,
                },
                {
                    cidrMask: 28,
                    name: 'elasticache',
                    subnetType: SubnetType.ISOLATED,
                },
            ],
        });

        /* ##########################################################
         * ######### COGNITO
         * ##########################################################
         */
        const userPool = new UserPool(this, 'TenantUserPool', {
            signInType: SignInType.EMAIL,
        });

        // User Pool Groups

        const sysAdminsGroup = new CfnUserPoolGroup(this, 'SysAdmins', {
            userPoolId: userPool.userPoolId,
            groupName: 'SysAdmins',
        });

        const tenantAdminsGroup = new CfnUserPoolGroup(this, 'TenantAdmins', {
            userPoolId: userPool.userPoolId,
            groupName: 'TenantAdmins',
        });

        // Allow Cognito to publish SMS messages
        const snsPublishRole = new Role(this, 'CognitoSnsPublishRole', {
            assumedBy: new ServicePrincipal('cognito-idp.amazonaws.com'),
        });

        const snsPublishPolicy = new ManagedPolicy(this, 'SnsPublishPolicy', {
            statements: [
                new PolicyStatement({
                    actions: ['sns:Publish'],
                    resources: ['*'],
                    effect: Effect.ALLOW,
                }),
            ],
        });

        snsPublishPolicy.attachToRole(snsPublishRole);

        // HACK: Need to get the underlying CF bindings due to missing features
        let userPoolCfnResource = userPool.node.findChild(
            'Resource'
        ) as CfnUserPool;

        userPoolCfnResource.smsConfiguration = {
            snsCallerArn: snsPublishRole.roleArn,
        };

        const authorizedUsersClient = new UserPoolClient(
            this,
            'TenantAdminAuthorizedUsers',
            {
                userPool,
            }
        );

        const identityPool = new CfnIdentityPool(this, 'TenantIdentityPool', {
            allowUnauthenticatedIdentities: false,
            cognitoIdentityProviders: [
                {
                    clientId: authorizedUsersClient.userPoolClientId,
                    providerName: userPool.userPoolProviderName,
                },
            ],
        });

        /* ##########################################################
         * ######### ELASTICSEARCH
         * ##########################################################
         */

        // Place Elasticsearch domain in a Security Group
        let securityGroupName = 'elasticsearch-sg';
        const elasticSeachSecurityGroup = new SecurityGroup(
            this,
            securityGroupName,
            {
                securityGroupName,
                vpc: vpc,
            }
        );

        let elasticsearchDomain = new CfnDomain(this, 'saas-demo-domain', {
            domainName: 'saas-demo-domain',
            elasticsearchVersion: '7.1',
            elasticsearchClusterConfig: {
                instanceType: 't2.small.elasticsearch',
                instanceCount: 1,
            },
            // encryptionAtRestOptions: { //< -- Encryption at rest is not supported for t2.small instances
            //     enabled: true,
            // },
            ebsOptions: {
                ebsEnabled: true,
                volumeType: EbsDeviceVolumeType.GP2,
                volumeSize: 10,
            },
            vpcOptions: {
                securityGroupIds: [elasticSeachSecurityGroup.securityGroupId],
                subnetIds: [vpc.isolatedSubnets[0].subnetId],
            },
        });

        /* ##########################################################
         * ######### DYNAMODB
         * ##########################################################
         */

        const tenantTable = new Table(this, 'Tenants', {
            partitionKey: {
                name: 'TenantId',
                type: AttributeType.STRING,
            },
            sortKey: {
                name: 'DataType',
                type: AttributeType.STRING,
            },
            billingMode: BillingMode.PAY_PER_REQUEST,
            serverSideEncryption: true,
            stream: StreamViewType.NEW_IMAGE,
        });

        /* ##########################################################
         * ######### LAMBDA
         * ##########################################################
         */

        // Lambda layers

        var dirName = path.join(
            __dirname,
            './lambda/layers/common-npm-modules/'
        );

        /****** COMMON MODULES LAYER (meaning that commonly shared / needed npm modules goes into this layer) */
        let commonNpmModulesLayer = new LayerVersion(
            this,
            'common-npm-modules',
            {
                code: new AssetCode(dirName),
                compatibleRuntimes: [Runtime.NODEJS_8_10, Runtime.NODEJS_10_X],
            }
        );

        // Tenant System Service Admin Role
        const tenantAdminSystemRole = new Role(
            this,
            'TenantSystemDynamoDbReadWriter',
            {
                assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
            }
        );

        tenantTable.grantReadWriteData(tenantAdminSystemRole);

        const tenantReaderSystemRole = new Role(
            this,
            'TenantSystemDynamoDbReader',
            {
                assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
            }
        );

        tenantTable.grantReadData(tenantReaderSystemRole);

        /** Creates a new tenant record in DynamoDB */
        const createTenant = new Function(this, 'CreateTenant', {
            runtime: Runtime.NODEJS_10_X,
            handler: 'index.handler',
            code: Code.asset(
                path.join(__dirname, './lambda/functions/createTenant')
            ),
            environment: {
                tableName: tenantTable.tableName,
            },
            role: tenantAdminSystemRole,
            layers: [commonNpmModulesLayer],
        });

        /** Gets a tenant by ID (hash key in DynamoDB table) */
        const getTenantById = new Function(this, 'GetTenantById', {
            runtime: Runtime.NODEJS_10_X,
            handler: 'index.handler',
            code: Code.asset(
                path.join(__dirname, './lambda/functions/getTenantById')
            ),
            environment: {
                tableName: tenantTable.tableName,
            },
            role: tenantAdminSystemRole,
        });

        const dynamoDbEsStreamerServiceRole = new Role(
            this,
            'DynamoDbEsStreamerRole',
            {
                assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
            }
        );

        const dynamoDbEsStreamerPolicy = new ManagedPolicy(
            this,
            'DynamoDbEsStreamerPolicy',
            {
                statements: [
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            'es:ESHttpPost',
                            'es:ESHttpPut',
                            'dynamodb:DescribeStream',
                            'dynamodb:GetRecords',
                            'dynamodb:GetShardIterator',
                            'dynamodb:ListStreams',
                            'logs:CreateLogGroup',
                            'logs:CreateLogStream',
                            'logs:PutLogEvents',
                            'ec2:CreateNetworkInterface',
                            'ec2:DescribeNetworkInterfaces',
                            'ec2:DeleteNetworkInterface',
                        ],
                        resources: ['*'],
                    }),
                ],
            }
        );

        dynamoDbEsStreamerPolicy.attachToRole(dynamoDbEsStreamerServiceRole);
        // Make sure the service role for Lambda has access to VPC
        dynamoDbEsStreamerServiceRole.addManagedPolicy(
            ManagedPolicy.fromAwsManagedPolicyName(
                'AWSLambdaVPCAccessExecutionRole'
            )
        );

        if (elasticsearchDomain.domainName) {
            const addTenantToESIndex = new Function(
                this,
                'AddTenantToESIndex',
                {
                    runtime: Runtime.NODEJS_10_X,
                    handler: 'index.handler',
                    code: Code.asset(
                        path.join(
                            __dirname,
                            './lambda/functions/addTenantToESIndex'
                        )
                    ),
                    environment: {
                        tableName: tenantTable.tableName,
                        elasticsearchDomain: elasticsearchDomain.domainName,
                    },
                    role: dynamoDbEsStreamerServiceRole,
                }
            );

            addTenantToESIndex.addEventSource(
                new DynamoEventSource(tenantTable, {
                    batchSize: 2,
                    startingPosition: StartingPosition.LATEST,
                })
            );
        }

        // ****** COGNITO LAMBDA FUNCTIONS

        const cognitoAdminServiceRole = new Role(
            this,
            'CognitoAdminServiceRole',
            {
                assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
            }
        );

        const cognitoAdminPolicy = new ManagedPolicy(
            this,
            'CognitoAdminPolicy',
            {
                statements: [
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        resources: [userPool.userPoolArn],
                        actions: [
                            'cognito-idp:AdminCreateUser',
                            'cognito-idp:AdminDeleteUser',
                            'cognito-idp:AdminGetUser',
                            'cognito-idp:AdminAddUserToGroup',
                        ],
                        //TODO: Consider adding a condition to allow only users in a 'SysAdmins' group access
                    }),
                ],
            }
        );

        cognitoAdminPolicy.attachToRole(cognitoAdminServiceRole);

        const addUserToGroup = new Function(this, 'CognitoAddUserToGroup', {
            runtime: Runtime.NODEJS_10_X,
            handler: 'index.handler',
            code: Code.asset(
                path.join(__dirname, './lambda/functions/cognitoAddUserToGroup')
            ),
            environment: {
                cognitoUserPoolId: userPool.userPoolId,
            },
            role: cognitoAdminServiceRole,
        });

        const checkIfUserExists = new Function(
            this,
            'CognitoCheckIfUserExists',
            {
                runtime: Runtime.NODEJS_10_X,
                handler: 'index.handler',
                code: Code.asset(
                    path.join(
                        __dirname,
                        './lambda/functions/cognitoCheckIfUserExists'
                    )
                ),
                environment: {
                    cognitoUserPoolId: userPool.userPoolId,
                },
                role: cognitoAdminServiceRole,
            }
        );

        const cognitoCreateUser = new Function(this, 'CognitoCreateUser', {
            runtime: Runtime.NODEJS_10_X,
            handler: 'index.handler',
            code: Code.asset(
                path.join(__dirname, './lambda/functions/cognitoCreateUser')
            ),
            environment: {
                cognitoUserPoolId: userPool.userPoolId,
            },
            role: cognitoAdminServiceRole,
        });

        const cognitoDeleteUser = new Function(this, 'CognitoDeleteUser', {
            runtime: Runtime.NODEJS_10_X,
            handler: 'index.handler',
            code: Code.asset(
                path.join(__dirname, './lambda/functions/cognitoDeleteUser')
            ),
            environment: {
                cognitoUserPoolId: userPool.userPoolId,
            },
            role: cognitoAdminServiceRole,
        });

        /* ##########################################################
         * ######### STEP FUNCTIONS
         * ##########################################################
         */

        // Tasks

        const createTenantStep = new Task(this, 'CreateTenantStep', {
            task: new InvokeFunction(createTenant),
            resultPath: '$.createTenantResult',
        });

        const createTenantAdminStep = new Task(this, 'CreateTenantAdminStep', {
            task: new InvokeFunction(cognitoCreateUser),
            inputPath: '$.adminDetails', // <-- Pick adminDetails which should be part of the initial input
            resultPath: '$.result.createAdminUserResult', // Output the result of the createUser Lambda (Cognito user-info)
            outputPath: '$.result', // <-- Combine the results from this and previous step(create tenant)
        });

        const addUserToGroupStep = new Task(this, 'AddUserToCognitoGroupStep', {
            task: new InvokeFunction(addUserToGroup),
        });

        const tenantOnboaringDefinition = createTenantStep
            .next(createTenantAdminStep)
            .next(addUserToGroupStep);

        const stateMachine = new StateMachine(
            this,
            'TenantOnboardingStateMachine',
            {
                definition: tenantOnboaringDefinition,
                timeout: Duration.minutes(1),
            }
        );

        /* ##########################################################
         * ######### API GATEWAY
         * ##########################################################
         */

        // Role for step functions state machine to be executed via API Gateway
        const apiGatewayStepFunctionsRole = new Role(
            this,
            'TenantOnboardingStateMachineRole',
            {
                assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
            }
        );

        const tenantOnboardingStateMachinePolicy = new Policy(
            this,
            'TenantOnboardingStateMachinePolicy',
            {
                statements: [
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        resources: [stateMachine.stateMachineArn],
                        actions: ['states:StartExecution'],
                    }),
                ],
            }
        );

        tenantOnboardingStateMachinePolicy.attachToRole(
            apiGatewayStepFunctionsRole
        );

        // **** SYS ADMIN REST API ************
        const restApiName = 'system-admin-api';

        const sysAdminApi = new RestApi(this, restApiName, {
            restApiName,
        });

        const cognitoAuthorizer = new CfnAuthorizer(
            this,
            'cognito-authorizer',
            {
                name: 'Cognito_Authorizer',
                restApiId: sysAdminApi.restApiId,
                type: 'COGNITO_USER_POOLS',
                identitySource: 'method.request.header.Authorization',
                providerArns: [userPool.userPoolArn],
            }
        );

        // *** Method Responses / Integration responses / mapping templates

        /** Default method responses for JSON content */
        const defaultJsonContentMethodResponses = [
            {
                statusCode: '200',
                responseModels: { 'application/json': 'Empty' },
            },
            {
                statusCode: '400',
            },
            {
                statusCode: '500',
            },
        ];

        /** Default integrationResponses for JSON content */
        const defaultJsonIntegrationResponses = [
            {
                statusCode: '200',
            },
            {
                statusCode: '400',
                selectionPattern: `4\d{2}`,
            },
            {
                statusCode: '500',
                selectionPattern: `5\d{2}`,
            },
        ];

        /**
         * Create a request template for API Gateway -> State Machine integration escaping input JSON,
         * and preprending the State Machine ARN this making this hidden for the caller of the API endpoint
         */
        const stateMachineRequestTemplate = {
            'application/json': JSON.stringify({
                input: "$util.escapeJavaScript($input.json('$'))",
                stateMachineArn: `${stateMachine.stateMachineArn}`,
            }),
        };

        /********************************************************************
         * {root}/tenant
         ********************************************************************/

        const tenantApiResource = sysAdminApi.root.addResource('tenants');

        tenantApiResource.addMethod(
            'POST',
            new AwsIntegration({
                service: 'states',
                action: 'StartExecution',
                options: {
                    passthroughBehavior: PassthroughBehavior.NEVER,
                    requestTemplates: {
                        'application/json': JSON.stringify({
                            input: "$util.escapeJavaScript($input.json('$'))",
                            stateMachineArn: `${stateMachine.stateMachineArn}`,
                        }),
                    },
                    credentialsRole: apiGatewayStepFunctionsRole,
                    // integrationResponses: defaultJsonIntegrationResponses,
                },
            }),
            {
                // methodResponses: [
                //     {
                //         statusCode: '200',
                //         responseModels: createDefaultJsonContentMethodResponses(),
                //     },
                // ],
                authorizationType: AuthorizationType.COGNITO,
                authorizer: {
                    authorizerId: cognitoAuthorizer.ref,
                },
            }
        );
    }
}

const createDefaultJsonContentMethodResponses = (): any[] => {
    const methodResponses = [
        {
            statusCode: '200',
            responseModels: { 'application/json': 'Empty' },
        },
        {
            statusCode: '400',
        },
        {
            statusCode: '500',
        },
    ];

    return methodResponses;
};
