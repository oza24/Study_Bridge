import { S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import fs from "fs";

// Load env vars
const envStr = fs.readFileSync(".env", "utf-8");
const envVars = Object.fromEntries(envStr.split('\n').filter(l => l && !l.startsWith('#')).map(l => {
  const i = l.indexOf('=');
  return [l.substring(0, i).trim(), l.substring(i + 1).trim()];
}));

const region = envVars.AWS_REGION || "us-east-1";
const credentials = {
  accessKeyId: envVars.AWS_ACCESS_KEY_ID,
  secretAccessKey: envVars.AWS_SECRET_ACCESS_KEY,
};

const s3Client = new S3Client({ region, credentials });
const ddbClient = new DynamoDBClient({ region, credentials });

const bucketName = envVars.AUDIO_BUCKET_NAME;
const tableName = envVars.DYNAMODB_TABLE;

async function setup() {
  console.log("Setting up AWS resources...");

  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(`Bucket ${bucketName} already exists.`);
  } catch (error) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      console.log(`Creating bucket ${bucketName}...`);
      await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
      console.log("Bucket created successfully.");
      
      // Remove public access block or set up CORS if needed, but since we generate presigned URLs for GET, cross-origin will be requested by the <audio> tag.
      // <audio> tag doesn't strictly need CORS unless we do fetch() grabbing its byte stream. But for direct src="" it just works, so we don't need complicated CORS setup for this hackathon.
    } else {
      console.error("Error checking bucket:", error);
    }
  }

  try {
    await ddbClient.send(new DescribeTableCommand({ TableName: tableName }));
    console.log(`Table ${tableName} already exists.`);
  } catch (error) {
    if (error.name === "ResourceNotFoundException") {
      console.log(`Creating DynamoDB table ${tableName}...`);
      await ddbClient.send(
        new CreateTableCommand({
          TableName: tableName,
          KeySchema: [
            { AttributeName: "sessionId", KeyType: "HASH" }
          ],
          AttributeDefinitions: [
            { AttributeName: "sessionId", AttributeType: "S" }
          ],
          BillingMode: "PAY_PER_REQUEST",
        })
      );
      console.log("DynamoDB table created successfully.");
    } else {
      console.error("Error checking table:", error.message);
    }
  }
}

setup().catch(console.error);
