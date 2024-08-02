/* global fetch */

import {createHmac} from "crypto";
import {WebhooksHelper} from 'square';
import {SQSClient, GetQueueUrlCommand, SendMessageCommand} from "@aws-sdk/client-sqs";

const paramStorePort = "2773"
const paramStoreField = "SIGNATURE_KEY"

const queueName = "test-main-queue"
const queueRegion = "us-east-2"

export const handler = async (event) => {
    const paramStoreURL = "http://localhost:" + paramStorePort + "/systemsmanager/parameters/get?name=" + paramStoreField
    const aws_token = process.env.AWS_SESSION_TOKEN
    const getParamSigKey = await fetch(paramStoreURL, {
        method: "GET",
        headers: {
            "X-Aws-Parameters-Secrets-Token": aws_token,
        },
    });

    let prefix = ""
    if (event.headers === undefined) {
        prefix += "event.headers "
    } else {
        if (!('x-square-signature' in event.headers)) {
            prefix += "event.headers['x-square-signature'] "
        }
        if (!('x-square-hmacsha256-signature' in event.headers)) {
            prefix += "event.headers['x-square-hmacsha256-signature'] "
        }
    }
    if (event.requestContext === undefined) {
        prefix += "event.requestContext "
    } else {
        if (event.requestContext.domainName === undefined) {
            prefix += "event.requestContext.domainName "
        }
        if (event.requestContext.http === undefined) {
            prefix += "event.requestContext.http "
        } else if (event.requestContext.http.path === undefined) {
            prefix += "event.requestContext.http.path "
        }
        if (event.requestContext.accountId === undefined) {
            prefix += "event.requestContext.accountId "
        }
    }

    try {
        let errMessage = ""
        if (!getParamSigKey.ok) {
            errMessage += `Error occured while requesting secret SIGNATURE_KEY. Responses status was ${getParamSigKey.status} \n`;
        }

        if (prefix !== "") {
            errMessage += (prefix + " UNDEFINED \n");
        }

        if (errMessage !== "") {
            throw new Error(errMessage);
        }

        const paramStoreVal = (await getParamSigKey.json()).Parameter.Value;
        const hmac = createHmac('sha1', paramStoreVal);

        const requestUrl = `https://${
            event.requestContext.domainName + event.requestContext.http.path
        }`;

        hmac.update(requestUrl + event.body);
        const hash = hmac.digest('base64');

        // Check if we have a valid webhook event
        if (hash !== event.headers['x-square-signature']) {
            // We have an invalid webhook event.
            // Logging and stopping processing.
            console.info(`Mismatched request x-square-signature, ${
                hash
            } !== ${
                event.headers['x-square-signature']
            }`)
            errMessage += "Mismatched request x-square-signature \n";
        }

        const signature = event.headers['x-square-hmacsha256-signature']
        if (!WebhooksHelper.isValidWebhookEventSignature(event.body, signature, paramStoreVal, requestUrl)) {
            // Signature is invalid. Return 403 Forbidden.
            // response.writeHead(403);
            console.info("WebhooksHelper.isValidWebhookEventSignature returned FALSE, x-square-hmacsha256-signature " + signature);
            errMessage += "WebhooksHelper.isValidWebhookEventSignature returned FALSE, x-square-hmacsha256-signature \n";
        }

        if (errMessage !== "") {
            throw new Error(errMessage);
        }


        const sqs = new SQSClient({region: queueRegion});

        const input = {
            QueueName: queueName,
            QueueOwnerAWSAccountId: event.requestContext.accountId,
        };
        const getUrlCommand = new GetQueueUrlCommand(input);
        const queueURL = (await sqs.send(getUrlCommand)).QueueUrl;

        const params = {
            MessageBody: event.body,
            QueueUrl: queueURL,
            MessageAttributes: {
                Header: {
                    DataType: "String",
                    StringValue: JSON.stringify(event.headers),
                },
                RequestContext: {
                    DataType: "String",
                    StringValue: JSON.stringify(event.requestContext)
                }
            }
        };
        const command = new SendMessageCommand(params);
        const sendToQueue = await sqs.send(command);
        console.log(sendToQueue);

        return {
            'statusCode': sendToQueue['$metadata'].httpStatusCode,
            'body': "ok"
        }
    } catch (err) {
        console.info(err);

        return {
            'statusCode': 403,
            'headers': {
                'Content-Type': 'application/json'
            },
            'body': JSON.stringify({
                message: err.message
            })
        };
    }
};
