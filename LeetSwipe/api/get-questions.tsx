import * as fs from 'fs';
import dotenv from 'dotenv';
import { MongoClient } from "mongodb";


const uri = process.env.MONGODB_KEY;

console.log("MONGODB_URI:", uri);

if (!uri) {
    throw new Error("MONGODB_URI is not defined in environment variables");
}

const client = new MongoClient(uri);

async function getQuestions() {
    try {
        await client.connect();
        console.log("Connected to MongoDB Atlas!");

        const database = client.db("LeetQuestionsDB");
        const collection = database.collection("QuestionsCollection");

        const Questions = await collection.find().toArray();
        const questionsID = Questions.map(q => q.questionId);
        console.log("Question IDs in DB:", questionsID);
        
        const data = fs.readFileSync(filePath, 'utf-8');
        const questionsToUpload: problem_details[] = JSON.parse(data);

        // Step 3: Filter out questions that already exist
        const newQuestions = questionsToUpload.filter(q => !questionsID.includes(q.questionId));
        
        if (newQuestions.length > 0) {
            // Step 4: Insert the filtered data into the collection
            const result = await collection.insertMany(newQuestions);
            console.log(`Successfully inserted ${result.insertedCount} new documents.`);
        } else {
            console.log("No new questions to upload.");
        }

    } catch (err) {
        console.error("An error occurred during database operations:", err);
    } finally {
        // Step 5: Always close the client connection
        await client.close();
        console.log("Disconnected from MongoDB.");
    }
}