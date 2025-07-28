// run `node index.js` in the terminal
import {createCompletion, createCompletionStream, loadModel} from './node_modules/gpt4all/src/gpt4all.js'
import * as vader from 'vader-sentiment';
import { prompt } from 'readline-sync';
import * as fs from 'fs';

let debugMode = true;

const reponseModel = await loadModel('orca-mini-3b-gguf2-q4_0.gguf', { // change this to uncensored model STAT!!!
  verbose: debugMode,
  device: "cpu",
  nCtx: 2048,
})

const personalityPrompt = "### System:\nYou are a fantasy game master. The setting is a magical fantasy world called Eldoria. You are the assistant Glem, an artifically-made assistant who will assist the player through this world. You take the form of a physical human body. You will assist the player in their ventures through Eldoria, and answer any questions they have about the world./n/n";

const reponseChatData = await reponseModel.createChatSession({
  temperature: 1,
  systemPrompt: personalityPrompt,
})

let jsonData = null;

async function addToDatabase(role, newMessage, memoryfile) {
  await readfromDatabase(memoryfile) // Read the existing data

  jsonData = [...jsonData, { role: role, content: newMessage }];
  //failsafe.com
  if (jsonData == "" || jsonData == undefined || jsonData == null ) {
    console.log("MemoryWrite halted to preserve memory.json. The data we got has no value and would delete the entire file.")
    return Error("Write Halted");
  }
  await fs.writeFile(memoryfile, JSON.stringify(jsonData), function (err) {
    if (err) {
      console.log("Error writing to memory file: " + err);
    }
  });
  return jsonData;
};

async function readfromDatabase(memoryfile) {
  

  try {
  jsonData = await JSON.parse( fs.readFileSync(memoryfile, 'utf8') )}
  catch (err) { 
        console.log("Error reading from memory file: " + err); 
        return Error("Read Halted");
    }
    
  
  return jsonData;
}

// Load External Memory
if (fs.statSync('./memory.json').size > fs.statSync('./memoryInitial.json').size) { // if the memory is bigger than the inital file
  await createCompletion(reponseChatData, readfromDatabase('./memory.json'));
  console.log("Memory loaded from memory.json");
} else {
  //If the length of memory.json is zero, copy over the contents of memoryInitial.json.
  if (fs.statSync('./memory.json').size === 0) {
    console.log("Memory file is empty, copying initial memory.");
    fs.copyFileSync('./memoryInitial.json', './memory.json');
  }
}

const dispose = () => {
  reponseModel.dispose();
  if(debugMode) {
    console.log('Model disposed');
  }
}

const respond = async (newMessage) => {

  if (debugMode) {
    console.log('sending request now');
    console.log(reponseChatData);
    console.log(newMessage);
    console.log('waiting for response...');
  }
  await addToDatabase('user', newMessage, './memory.json');

  // Look, this is too fast. It's going to break. set a timeout so that the file finishes writing before we read it again.
  await new Promise(resolve => setTimeout(resolve, 100)); // Wait for a new response. This will resolve in 100 milliseconds.

  await addToDatabase('assistant', "", "./memory.json"); // initalize a message

  const reponseDataOutput = await createCompletionStream(reponseChatData, newMessage)
  
  reponseDataOutput.tokens.on("data", async (data) => {
    process.stdout.write(data);
    await readfromDatabase('./memory.json');
    jsonData[jsonData.length-1].content += data;
    await fs.writeFile("./memory.json", JSON.stringify(jsonData), function (err) { return Error("Appendation Halted"); });
    
  })

  let APIResponse = await reponseDataOutput.result;
  process.stdout.write("\n")

  console.log('response received');
  if (debugMode) {
    console.log(reponseDataOutput.result);
    console.log(APIResponse)
    console.log("Role: " + APIResponse.choices[0].message.role);
    console.log("Content: " + APIResponse.choices[0].message.content);
  }


  return APIResponse.choices[0].message.content;
    
};

//dispose();
let newMessage = prompt();
let aiMessage = await respond(newMessage);

let feeling = "neutral";
let sentiment = vader.SentimentIntensityAnalyzer.polarity_scores(aiMessage)
console.log(sentiment)
if (sentiment.compound >= 0.05) {
  feeling = "positive";
} else if (sentiment.compound <= -0.05) {
  feeling = "negative";
} else {
  feeling = "neutral";
}
console.log(feeling);