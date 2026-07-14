import os
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from dotenv import load_dotenv
from pydantic import BaseModel


class QuestionSchema(BaseModel):
    leetQuestionId: int
    QuestionId: str
    Question: str
    Options: list[str]
    Answer: int
    Explanation: str

class Questions(BaseModel):
    questions: list[QuestionSchema]

load_dotenv()
uri = os.environ.get("MONGODB_KEY")

def cleanData(questions: list[dict]) -> list[dict]:
    cleaned_questions = []
    for question in questions:
        content = question.get("content", "")
        cleaned_data = ""
        delete_flag = False
        for char in content:
            if char == "<":
                delete_flag = True
                continue
            elif char == ">":
                delete_flag = False
                continue
            if delete_flag: 
                continue
            else:
                cleaned_data += char
        question["content"] = cleaned_data
        del question["questionFrontendId"]
        del question["_id"]
        cleaned_questions.append(question)
    return cleaned_questions

def getQuestions():
    if not uri:
        raise ValueError("The MONGODB_KEY environment variable is not set.")

    # Create a new client and connect to the server
    try:
        client = MongoClient(uri, server_api=ServerApi('1'))
        
        # Ping the deployment to confirm a successful connection
        client.admin.command('ping')
        print("Pinged your deployment. You successfully connected to MongoDB!")

    except Exception as e:
        print(f"An error occurred: {e}")
        exit()

    # Select the database and collection
    db = client["LeetQuestionsDB"]
    collection = db["QuestionsCollection"] # Changed to a valid collection name from the sample dataset

    # Retrieve the document
    try:
        retrieved_result = list(collection.find())
        retrieved_result = cleanData(retrieved_result)
        return retrieved_result
            

    except Exception as e:
        print(f"An error occurred during insertion: {e}")

    finally:
        # Close the connection
        client.close()
        print("Connection closed.")



def postQuestions(Questions: list[QuestionSchema]):
    if not uri:
        raise ValueError("The MONGODB_KEY environment variable is not set.")

    # Create a new client and connect to the server
    try:
        client = MongoClient(uri, server_api=ServerApi('1'))
        
        # Ping the deployment to confirm a successful connection
        client.admin.command('ping')
        print("Pinged your deployment. You successfully connected to MongoDB!")

    except Exception as e:
        print(f"An error occurred: {e}")
        exit()

    # Select the database and collection
    db = client["LeetQuestionsDB"]
    collection = db["GeneratedQuestionsCollection"] # Changed to a valid collection name from the sample dataset

    # Upsert each document (idempotent on questionId to avoid duplicates)
    try:
        for question in Questions.questions:
            question_dict = question.model_dump()
            key = question_dict.get("questionId")
            if key:
                collection.replace_one({"questionId": key}, question_dict, upsert=True)
            else:
                collection.insert_one(question_dict)
        print(f"Upserted {len(Questions.questions)} questions successfully.")

    except Exception as e:
        print(f"An error occurred during insertion: {e}")

    finally:
        # Close the connection
        client.close()
        print("Connection closed.")