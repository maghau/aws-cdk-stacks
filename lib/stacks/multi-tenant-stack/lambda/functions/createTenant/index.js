const uuidv4 = require('uuid/v4');
const ddb = require('aws-sdk/clients/dynamodb');

exports.handler = async function(event, context) {
    const tableName = process.env.tableName;
    const result = await createTenant(event, tableName);
    return result;
};

const createTenant = async (event, tableName) => {
    const documentClient = new ddb.DocumentClient();
    const {
        name,
        adminDetails,
        address,
        postCode,
        city,
        region,
        country,
        phoneNumber,
        parentTenantId,
    } = event;

    const tenantId = uuidv4();
    const params = {
        TableName: tableName,
        Item: {
            TenantId: tenantId,
            DataType: 'TENANT_RECORD',
            name: name || undefined,
            adminEmail: adminDetails.email || undefined,
            address: address || undefined,
            postCode: postCode || undefined,
            city: city || undefined,
            region: region || undefined,
            country: country || undefined,
            phoneNumber: phoneNumber || undefined,
            parentTenantId: parentTenantId || undefined,
        },
    };

    const result = await documentClient
        .put(params, (err, data) => {
            if (err) {
                console.error(err);
                throw new Error(err.message);
            }
            return data;
        })
        .promise();

    return {
        tenantId,
    };
};
