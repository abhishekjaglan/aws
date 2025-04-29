import { 
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    DeleteBucketCommand,
    paginateListObjectsV2,
    GetObjectCommand,
} from "@aws-sdk/client-s3";

import {createInterface} from "node:readline/promises";
import dotenv from "dotenv";
import { config } from "./config";
dotenv.config();

const s3Client = new S3Client({
    region: config.AWS_REGION,
    credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID!,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY!,
    },
});

const sendObject = async() => {
    try {
        const command = new PutObjectCommand({
            Bucket: config.AWS_S3_BUCKET!,
            Key: "test_key.txt",
            Body: "Hello, this is a test object.",
            ContentType: "text/plain",
        });
        const sentObject = await s3Client.send(command);
        console.log("Object sent successfully.", sentObject);
    } catch (error) {
        console.error("Error sending object:", error);
    }
};

const readObject = async() => {
    try {
        const command = new GetObjectCommand({
            Bucket: config.AWS_S3_BUCKET!,
            Key:"test_key.txt",
        });
        const data = await s3Client.send(command);
        console.log("Object read successfully.", data);
        console.log("Object Body: ", data.Body);
    } catch (error) {
        console.error("Error reading object:", error);
    }
}

const paginateObjectsAndDelete = async() => {
    try {
        const paginator = paginateListObjectsV2(
            {   client: s3Client },
            { Bucket: config.AWS_S3_BUCKET! }
        );

        for await (const page of paginator){
            console.log("Page: ", page);
            const objects = page.Contents;
            console.log("Paginated objects: ", objects);
            if(objects){
                for (const object of objects){
                    try {
                        console.log("Object: ", object);
                        const command = new DeleteObjectCommand({
                            Bucket: config.AWS_S3_BUCKET!,
                            Key: object.Key!,
                        });
                        await s3Client.send(command);
                    } catch (error) {
                        console.error("Error deleting object:", error);
                    }
                }
            }
        }
        // const command = new DeleteBucketCommand({
        //     Bucket: config.AWS_S3_BUCKET!,
        // });
        // await s3Client.send(command);
        // console.log("Bucket deleted successfully.");
    } catch (error) {
        console.error("Error paginating objects:", error);
    }
}

const main = async() => {
    await sendObject();
    await readObject();

    const prompt = createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const answer = await prompt.question("Do you want to delete the objects? (y/n): ");
    
    if (answer.toLowerCase() === 'y') {
        await paginateObjectsAndDelete();
    } else {
        console.log("No objects will be deleted.");
    }
}

main()
    .then(() => {
        console.log("Main function executed successfully.");
    })
    .catch((error) => {
        console.error("Error in main function:", error);
    });