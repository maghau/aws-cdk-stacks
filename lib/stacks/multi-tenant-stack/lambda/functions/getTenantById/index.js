const ddb = require('aws-sdk/clients/dynamodb');

exports.handler = async function(event, context) {
    const tableName = process.env.tableName;
    const result = await getTenantRecord(event, tableName);
    return result;
};

const getTenantRecord = async (event, tableName) => {
    const documentClient = new ddb.DocumentClient();
    const { tenantId } = event;

    const params = {
        TableName: tableName,
        Key: {
            TenantId: tenantId,
            DataType: 'TENANT_RECORD',
        },
    };

    const result = await documentClient
        .get(params, (err, data) => {
            if (err) {
                console.error(err);
                throw new Error(err.message);
            }
            return data;
        })
        .promise();

    return result;
};
