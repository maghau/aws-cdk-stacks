let AWS = require('aws-sdk');

exports.handler = async function(event, context) {
    const userPoolId = process.env.cognitoUserPoolId;
    const result = await checkIfUserExists(event, userPoolId);
    return result;
};

const checkIfUserExists = async (event, userPoolId) => {
    const {
        username, // <-- Userid
    } = event;

    const cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider();
    const params = {
        UserPoolId: userPoolId,
        Username: username,
    };

    try {
        const result = await cognitoidentityserviceprovider
            .adminGetUser(params)
            .promise();
        return {
            statusCode: 200,
            body: {
                userExists: true,
            },
        };
    } catch (error) {
        return {
            statusCode: 200, // <-- Explicity set 200 response since this is a true / false scenario
            body: {
                userExists: false,
            },
        };
    }
};
