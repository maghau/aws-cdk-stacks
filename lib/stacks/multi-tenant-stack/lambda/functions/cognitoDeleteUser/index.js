let AWS = require('aws-sdk');

exports.handler = async function(event, context) {
    const { userId } = event;

    const userPoolId = process.env.cognitoUserPoolId;

    return deleteUser(userPoolId, userId);
};

const deleteUser = async (userPoolId, userId) => {
    const cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider();
    const params = {
        UserPoolId: userPoolId,
        Username: userId,
    };

    try {
        const result = await cognitoidentityserviceprovider
            .adminDeleteUser(params)
            .promise();
        return {
            statusCode: 200,
            body: result,
        };
    } catch (error) {
        return error;
    }
};
