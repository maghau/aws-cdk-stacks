import cdk = require('@aws-cdk/core');

import {
    UserPool,
    CfnUserPoolGroup,
    CfnIdentityPool,
    SignInType,
    UserPoolClient,
    CfnUserPool,
} from '@aws-cdk/aws-cognito';
import { LayerVersion } from '@aws-cdk/aws-lambda';
import { Vpc } from '@aws-cdk/aws-ec2';
import { Table, BillingMode, AttributeType } from '@aws-cdk/aws-dynamodb';
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
         * ######### COGNITO
         * ##########################################################
         */
        const userPool = new UserPool(this, 'TenantUserPool', {
            signInType: SignInType.EMAIL,
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
    }
}
