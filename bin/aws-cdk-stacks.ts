#!/usr/bin/env node
import 'source-map-support/register';
import cdk = require('@aws-cdk/core');
import { AwsCdkStacksStack } from '../lib/aws-cdk-stacks-stack';

const app = new cdk.App();
new AwsCdkStacksStack(app, 'AwsCdkStacksStack');
