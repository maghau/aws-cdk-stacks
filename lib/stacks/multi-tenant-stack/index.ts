import cdk = require('@aws-cdk/core');

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
} from '@aws-cdk/aws-iam';
import { RestApi } from '@aws-cdk/aws-apigateway';
import { StateMachine } from '@aws-cdk/aws-stepfunctions';
import { CfnDomain } from '@aws-cdk/aws-elasticsearch';
import { PhysicalName } from '@aws-cdk/core';
import { EbsDeviceVolumeType } from '@aws-cdk/aws-autoscaling';
import path = require('path');

export class MultiTenantStack extends cdk.Stack {
    /*
     *****************************************************
     * Define stack resources
     *****************************************************
     */
    // // Cognito
    // private cognitoUserPool: UserPool | undefined;
    // private identityPool: CfnIdentityPool | undefined;
    // private cognitoSystemAdminsGroup: CfnUserPoolGroup | undefined;
    // private cognitoTenantAdminsGroup: CfnUserPoolGroup | undefined;
    // private cognitoUsersGroup: CfnUserPoolGroup | undefined;
    // // VPC
    // private defaultVpc: Vpc | undefined;
    // // DynamoDb
    // private tenantTable: Table | undefined;
    // // Lambda
    // private commonModulesLambdaLayer: LayerVersion | undefined;
    // private getTenantRecord: Function | undefined;
    // private createTenant: Function | undefined;
    // private addUserToTenantAcl: Function | undefined;
    // private cognitoAdminAddUserToGroup: Function | undefined;
    // private cognitoAdminCreateUser: Function | undefined;
    // private cognitoCheckIfUserExists: Function | undefined;
    // // API Gateway
    // private systemAdminApi: RestApi | undefined;
    // private tenantAdminApi: RestApi | undefined;
    // // Step Function
    // private tenantOnboardingStateMachine: StateMachine;
    // // Elasticsearch
    // private tenantDomain: CfnDomain | undefined;
    // // IAM Roles
    // private systemAdminServiceRole: Role | undefined;

    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
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

        // console.log('DIRNAME: ', dirName);

        let commonNpmModulesLayer = new LayerVersion(
            this,
            'common-npm-modules',
            {
                code: new AssetCode(dirName),
                compatibleRuntimes: [Runtime.NODEJS_8_10, Runtime.NODEJS_10_X],
            }
        );

        // Tenant System Admin Role
        const tenantAdminSystemRole = new Role(
            this,
            'TenantSystemDynamoDbReadWriter',
            {
                assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
            }
        );

        tenantTable.grantReadWriteData(tenantAdminSystemRole);

        const createTenantLambda = new Function(this, 'CreateTenant', {
            runtime: Runtime.NODEJS_10_X,
            handler: 'index.handler',
            code: Code.asset(
                path.join(__dirname, './lambda/functions/createTenant')
            ),
            environment: {
                tableName: tenantTable.tableName,
            },
            role: tenantAdminSystemRole,
            // layers: [commonNpmModulesLayer],
        });
    }
}
