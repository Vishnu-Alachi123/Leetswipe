import { LeetCode, fetcher } from "leetcode-query";
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import * as leetcodeTypes from "leetcode-query";
import * as fs from 'fs';
import dotenv from 'dotenv';

const filePath = "leetData.json"

dotenv.config();


interface problem_details {
    questionId: string;
    questionFrontendId: string;
    title:string;
    content: string;
    difficulty: leetcodeTypes.ProblemDifficulty;
    exampleTestcases: string;
    topicTags: leetcodeTypes.TopicTag[];
    hints: string[];
    sampleTestCase: string;
}
// setup browser
const _browser = chromium.use(stealth()).launch();
const _page = _browser
    .then((browser) => browser.newPage())
    .then(async (page) => {
        await page.goto("https://leetcode.com");
        return page;
    });

// use a custom fetcher
fetcher.set(async (...args) => {
    const page = await _page;

    const res = await page.evaluate(async (args) => {
        const res = await fetch(...args);
        return {
            body: await res.text(),
            status: res.status,
            statusText: res.statusText,
            headers: Object.fromEntries(res.headers),
        };
    }, args);

    return new Response(res.body, res);
});

// use as normal
const lc = new LeetCode();
const problems = await lc.problems();
const problems_list = problems.questions
const extracted_problems: problem_details[] = [];
for (let i = 0;i < problems_list.length - 97; i++) {
    const name = problems_list[i].title;
    const problem = await lc.problem(name);

    if (problem) {
        // Create a new object of type problem_details
        const newProblem: problem_details = {
            questionId: problem.questionId,
            questionFrontendId: problem.questionFrontendId,
            title: problem.title,
            content: problem.content,
            difficulty: problem.difficulty,
            exampleTestcases: problem.exampleTestcases,
            topicTags: problem.topicTags,
            hints: problem.hints,
            sampleTestCase: problem.sampleTestCase,
        };
        extracted_problems.push(newProblem); // Add the new object to the array
        const percent = i.toString() ;
        process.stdout.write("\r"+percent + "%")
    }
}
console.log(extracted_problems)

const jsonData = JSON.stringify(extracted_problems, null, 2);
fs.writeFile(filePath, jsonData, (err) => {
    if (err) {
      console.error("An error occurred:", err);
    } else {
      console.log("Successfully wrote data to", filePath);
    }
  });

await _browser.then((browser) => browser.close());

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_KEY;
console.log("MONGODB_URI:", uri);
if (!uri) {
    throw new Error("MONGODB_URI is not defined in environment variables");
}

const client = new MongoClient(uri);

async function checkQuestions() {
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



checkQuestions().catch(console.dir);