#!/usr/bin/env node
import 'source-map-support/register';
import cdk = require('@aws-cdk/core');

import { MultiTenantStack } from '../lib/stacks/multi-tenant-stack';

const app = new cdk.App();

const multiTenantStack = new MultiTenantStack(app, 'multi-tenant-stack');
