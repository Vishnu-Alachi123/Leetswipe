from langgraph.func import entrypoint, task

from typing import Optional
import getpass
import os
import json
from dotenv import load_dotenv
from prompts import TASK1, TASK2, TASK3
from quickstart import getQuestions, postQuestions, Questions, QuestionSchema
load_dotenv()  # This loads the variables from the .env file

api_key = os.environ.get("OPENAI_API_KEY")

from langchain.chat_models import init_chat_model

from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

leetData = getQuestions()

llm = init_chat_model("gpt-4o-mini", model_provider="openai")
formatting_llm = init_chat_model("gpt-4o-mini", model_provider="openai")

# ------------- structured output code -------------

structured_llm = llm.with_structured_output(Questions)

# ------------- end structured output code -------------

def Format_Question(question: str) -> Questions:
    """LLM call to format into structured output to parse and push to db"""
    msg = structured_llm.invoke(f"{TASK3} this is the questions: {question}")
    print("LLM Output:", msg)  # Debugging: Check the raw output
    if isinstance(msg, Questions):
        return msg  # Ensure the output matches the Questions schema
    else:
        raise ValueError("The LLM output does not match the Questions schema.")

# Invoke
Formatted_Questions: Questions = Questions(questions=[])  # This will store all formatted questions
ran = 3  # Number of iterations (adjust as needed)
print(leetData)

for i in range(ran):
    user_input = leetData[i]
    print(user_input)
    GeneratedQuestions = Format_Question(user_input)  # This will be of type Questions
    print(" ======================")
    print(GeneratedQuestions)
    for question in GeneratedQuestions.questions:
        Formatted_Questions.questions.append(question)  # Add the list of QuestionSchema objects

print(Formatted_Questions)
# Post the formatted questions to the database
postQuestions(Formatted_Questions)