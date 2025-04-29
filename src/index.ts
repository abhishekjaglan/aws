import { 
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    DeleteBucketCommand,
    paginateListObjectsV2,
    GetObjectCommand,
} from "@aws-sdk/client-s3";
import fs from "fs";
import {createInterface} from "node:readline/promises";
import dotenv from "dotenv";
import { config } from "./config";
import { DetectDocumentTextCommand, TextractClient } from "@aws-sdk/client-textract";
dotenv.config();

const s3Client = new S3Client({
    region: config.AWS_REGION,
    credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID!,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY!,
    },
});

const readObjectStream = async() => {
    try {
        const stream = fs.createReadStream("./Resume Latest.pdf");
        console.log("Stream: ", stream);
    } catch (error) {
        console.error("Error reading object stream:", error);
    }
}

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

const uploadPdfToS3 = async () => {
    try {
        // Create a readable stream from the PDF file
        const fileStream = fs.createReadStream('./Resume Latest.pdf');

        // Prepare the PutObjectCommand with the file stream
        const command = new PutObjectCommand({
            Bucket: config.AWS_S3_BUCKET!,
            Key: 'Resume_Latest.pdf', // Desired key (filename) in S3
            Body: fileStream,
            ContentType: 'application/pdf', // Set correct MIME type for PDF
        });

        // Send the command to upload the file
        const result = await s3Client.send(command);
        console.log('PDF uploaded successfully:', result);

        // Optional: Handle stream errors
        fileStream.on('error', (error) => {
            console.error('Error reading file stream:', error);
        });

        return result;
    } catch (error) {
        console.error('Error uploading PDF to S3:', error);
        throw error;
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

const mainS3 = async() => {
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

const textract = async() => {
    const textractClient = new TextractClient({
        region: config.AWS_REGION,
        credentials: {
            accessKeyId: config.AWS_ACCESS_KEY_ID!,
            secretAccessKey: config.AWS_SECRET_ACCESS_KEY!,
        },
    });

    const detectDocumentTextCommand = new DetectDocumentTextCommand({
        Document:{
            S3Object: {
                Bucket: config.AWS_S3_BUCKET!,
                Name: "Resume_Latest.pdf",
            }
        }
    });

    const response = await textractClient.send(detectDocumentTextCommand);
    console.log("Textract response: ", response);
    // const blocks = response.Blocks;
    // console.log("Textrct Blocks: ", blocks);
    const text = stitchTextFromBlocks(response);
    console.log("Extracted text: ", text);
}

function stitchTextFromBlocks(response:any): string {
    const blocks = response.Blocks || [];

    // Step 1: Collect LINE blocks and their child WORD block IDs
    const lineBlocks:any[] = [];
    const childWordIds = new Set();

    interface Block {
        BlockType: 'LINE' | 'WORD' | string;
        Text?: string;
        Id?: string;
        Relationships?: Relationship[];
    }

    interface Relationship {
        Type: 'CHILD' | string;
        Ids?: string[];
    }

    blocks.forEach((block: Block) => {
        if (block.BlockType === 'LINE') {
            lineBlocks.push(block);
            // Check Relationships for child WORD blocks
            if (block.Relationships) {
                block.Relationships.forEach((rel: Relationship) => {
                    if (rel.Type === 'CHILD' && rel.Ids) {
                        rel.Ids.forEach((id: string) => childWordIds.add(id));
                    }
                });
            }
        }
    });

    // Step 2: Collect WORD blocks that are not children of any LINE block
    const standaloneWordBlocks = blocks.filter((block: Block )=> 
        block.BlockType === 'WORD' && !childWordIds.has(block.Id)
    );

    // Step 3: Extract text from LINE blocks
    const lineText = lineBlocks
        .map(block => block.Text || '')
        .join('\n');

    // Step 4: Extract text from standalone WORD blocks
    const wordText = standaloneWordBlocks
        .map((block: Block) => block.Text || '')
        .join(' ');

    // Step 5: Combine the text (add a newline between LINE and WORD text if both exist)
    return lineText + (lineText && wordText ? '\n' : '') + wordText;
}

const main = async() => {
    await uploadPdfToS3();
    await textract();
}

// readObjectStream();
main()
    .then(() => {
        console.log("Main function executed successfully.");
    })
    .catch((error) => {
        console.error("Error in main function:", error);
    });

