import { promises as fs } from 'fs';
import { DOMParser, XMLSerializer } from 'xmldom';

import {generatePaddedUniqueId,generatePaddedUniqueSeqId} from './idGenerator.js';
import {getType} from './allTheEndpoints.js';
import { error } from 'console';

let bpmnDoc = null; // Module-level variable to store bpmnDoc
let xmlDoc = null;
const taskFilePath = './xmlFiles/task.xml';
const scriptTaskFilePath = './xmlFiles/scriptTask.xml';
const userTaskFilePath = './xmlFiles/userTask.xml';
const sequenceFilePath = './xmlFiles/sequenceFlow.xml';
const gatewayFilePath = './xmlFiles/parallelGateway.xml';
const XORgatewayFilePath = './xmlFiles/exclusiveGateway.xml';
const endEventFilePath = './xmlFiles/endEvent.xml';
const catchingIntermediateEventFilePath = './xmlFiles/intermediateCatchEvent.xml';
let taskDoc;
let userTaskDoc;
let scriptTaskDoc;
let sequenceDoc;
let parallelGatewayDoc;
let XORGatewayDoc;
let endEventDoc;
let catchingIntermediateEventDoc;
let counter = 1;
let seqCounter = 1;
let nextNodeID;
let previousNodeId;
let previousSeqID;
let isLastChildFlag = false; 
let endpoints;

export async function getBpmnDocFromHandler(){
    return bpmnDoc;
}

export async function loadXmlFiles() {
    try {
        const dataTask = await fs.readFile(taskFilePath, 'utf8');
        const dataUserTask = await fs.readFile(userTaskFilePath,'utf8');
        const dataScripTask = await fs.readFile(scriptTaskFilePath, 'utf8');
        const dataSeq = await fs.readFile(sequenceFilePath, 'utf8');
        const dataGate = await fs.readFile(gatewayFilePath, 'utf8');
        const dataXOR = await fs.readFile(XORgatewayFilePath,'utf8');
        const dataEnd = await fs.readFile(endEventFilePath,'utf8');
        const dataIntermediateCE = await fs.readFile(catchingIntermediateEventFilePath,'utf8');
        const domParser = new DOMParser();
        
        sequenceDoc = domParser.parseFromString(dataSeq, 'application/xml');
        scriptTaskDoc = domParser.parseFromString(dataScripTask, 'application/xml');
        taskDoc = domParser.parseFromString(dataTask, 'application/xml');
        parallelGatewayDoc = domParser.parseFromString(dataGate, 'application/xml');
        XORGatewayDoc = domParser.parseFromString(dataXOR, 'application/xml');
        endEventDoc = domParser.parseFromString(dataEnd, 'application/xml');
        catchingIntermediateEventDoc = domParser.parseFromString(dataIntermediateCE, 'application/xml');
        userTaskDoc = domParser.parseFromString(dataUserTask, 'application/xml');
        console.log('XML files loaded and parsed successfully.');
    } catch (err) {
        console.error('Failed to read or parse XML files:', err);
        throw err;
    }
}

// Function to set bpmnDoc
export async function setDocs(xmlDocPar,bpmnDocPar) {
    bpmnDoc = bpmnDocPar;
    xmlDoc = xmlDocPar; 

}

export async function traverseAndPrint(node, indent = '') {
    if (node.nodeType === 1 && node.parentNode.nodeName !== 'dataelements' ) { // Element node
        console.log(`${indent}Node: ${node.nodeName}`);
        switch (node.nodeName) {
            case 'call':
                await handleCall(node, indent + '  ');
                break;
                
            case 'manipulate':
                await handleManipulate(node, indent + '  ');
                break;
        
            case 'parallel':
                await handleParallel(node, indent + '  ', false);
                break;
        
            case 'loop':
                await handleLoop(node, indent + '  ', false);
                break;
        
            case 'choose':
                await handleDecision(node, indent + '  ', false);
                break;
        
            case 'stop':
                const parentNode = node.parentNode;
                if(parentNode && parentNode.nodeName === 'arguments'){
                    break;
                }else{
                    await addIntermediateCatchEvent('signal',"");
                    break;
                }
                
        
            default:
                for (let i = 0; i < node.childNodes.length; i++) {
                    await traverseAndPrint(node.childNodes[i], indent + '  ');
                }
                break;
        }
    } else if (node.nodeType === 3) { // Text node
        const trimmedText = node.nodeValue.trim();
        if (trimmedText) {
            console.log(`${indent}Text: ${trimmedText}`);
        }
    }
}

export async function handleLoop(node,indent,youarenested){
    const conditionType = node.getAttribute('mode');
    let loopExitXORId;
    switch(conditionType){
        case 'pre_test':
            loopExitXORId = handlePreLoop(node,indent,youarenested);
            break;
        case 'post_test':
            loopExitXORId = handlePostLoop(node,indent,youarenested);
            break;
        default:
            loopExitXORId = handlePreLoop(node,indent,youarenested);
            break;
    }
    return loopExitXORId;
}

export async function handlePostLoop(node, indent,youarenested) {
    
    const condition = node.getAttribute('condition');
    const divergingXORID = await addXORToBpmn("Diverging");
    const convergingXORID = await addXORToBpmn("Converging");

    if (!divergingXORID||!convergingXORID) {
        console.error("Error: Could not create diverging or converging exclusive gateway.");
        return;
    }

    const numberOfChildren = getNumberOfChildrenElements(node);
    const convirgingGateway = await findXORGatewayById(convergingXORID);
    if(!convirgingGateway){
        throw error('converging gateway could not be added to bpmndoc');
    }
   if(numberOfChildren!==0){
        const conditionSeqId =await addSequenceToBpmn(convergingXORID,divergingXORID);
        await addSequenceToBpmn(divergingXORID,nextNodeID);
        const conditionSeq = await findSequenceFlowById(conditionSeqId);
        const conditionElement = bpmnDoc.createElement('conditionExpression');
        const conditionText = bpmnDoc.createTextNode(condition);
        conditionSeq.setAttribute('name',condition);
        const conditionId = generatePaddedUniqueId();
        counter++;
    
        conditionElement.setAttribute('id',conditionId);
        conditionElement.setAttribute('xsi:type',"tFormalExpression");
        conditionElement.appendChild(conditionText);
        conditionSeq.appendChild(conditionElement);
        //<conditionExpression id="sid-a11248b9-3664-4176-91a6-9ca12b1b6310" xsi:type="tFormalExpression">a==1</conditionExpression>

    }
       
    for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        const parentNode = child.parentNode;
        const isParentLoop = parentNode.nodeName === 'loop';
        const isLast = getLastChildElement(parentNode) === child ;
        const isLastChild = parentNode && isParentLoop && isLast;

        if(child.nodeName === 'loop'){
            let childExitXORId = await handleLoop(child,' ',true);
            if(isLastChild){
                await addSequenceToBpmn(childExitXORId,convergingXORID);
            }
            isLastChildFlag = false;
        }else if(child.nodeName === 'call'||child.nodeName === 'manipulate'||child.nodeName === 'stop'){
            //the last child of the loop is adding sequence to the next node in addTaskToBpmn()
            if(isLastChild){ 
                isLastChildFlag = true; 
                await traverseAndPrint(child,' ');
                isLastChildFlag = false;
            }else{
                await traverseAndPrint(child,' ');
            }
            
        } else if(child.nodeName === 'parallel'){
            await handleParallel(child,indent,true);
        }    
        else if (child.nodeName === 'choose') {
            if (!isLastChild) {
                //child parallel sets sequence from its converging to the next node id instead of fathers converging node (if its last node)
                const gateways = await handleDecision(child, indent + '  ',true);
                const divergingID = gateways[0];
                previousNodeId = divergingID;
            }else{
                const gateways = await handleDecision(child, indent + '  ',true);
            }
    
        }else{
            await traverseAndPrint(child,' ');
        }
        if(isLastChild && child.nodeName !== 'loop'){
            isLastChildFlag = true;
            await addSequenceToBpmn(previousNodeId,convergingXORID);
            //currentNodeID = divergingXORID;
            isLastChildFlag = false;
        }
    }

    let parentsLastChild = getLastChildElement(node.parentNode)===node;
    
    if(!(youarenested&&parentsLastChild)){
        convirgingGateway.setAttribute('default',await addSequenceToBpmn(convergingXORID,nextNodeID));
    }else if(!youarenested&&parentsLastChild){
        convirgingGateway.setAttribute('default',await addSequenceToBpmn(convergingXORID,nextNodeID));
    }
    return convergingXORID;
}

export async function handlePreLoop(node, indent,youarenested) {
    
    const condition = node.getAttribute('condition');
    const divergingXORID = await addXORToBpmn("Diverging");
    let divergingGateway = await findXORGatewayById(divergingXORID);
    
    if (!divergingXORID) {
        console.error("Error: Could not create diverging exclusive gateway.");
        return;
    }
    const numberOfChildren = getNumberOfChildrenElements(node);
   if(numberOfChildren!==0){
        const conditionSeqId = await addSequenceToBpmn(divergingXORID,nextNodeID);
        const conditionSeq = await findSequenceFlowById(conditionSeqId);
        const conditionElement = bpmnDoc.createElement('conditionExpression');
        const conditionText = bpmnDoc.createTextNode(condition);
        conditionSeq.setAttribute('name',condition);
        const conditionId = generatePaddedUniqueId();
        counter++;
    
        conditionElement.setAttribute('id',conditionId);
        conditionElement.setAttribute('xsi:type',"tFormalExpression");
        conditionElement.appendChild(conditionText);
        conditionSeq.appendChild(conditionElement);
        //<conditionExpression id="sid-a11248b9-3664-4176-91a6-9ca12b1b6310" xsi:type="tFormalExpression">a==1</conditionExpression>

    }
       
    for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        const parentNode = child.parentNode;
        const isParentLoop = parentNode.nodeName === 'loop';
        const isLast = getLastChildElement(parentNode) === child ;
        const isLastChild = parentNode && isParentLoop && isLast;

        if(child.nodeName === 'loop'){
            
            let childExitXORId = await handleLoop(child,' ',true);
            if(isLastChild){
                await addSequenceToBpmn(childExitXORId,divergingXORID);
            }
            isLastChildFlag = false;
        }else if(child.nodeName === 'call'||child.nodeName === 'manipulate'||child.nodeName === 'stop'){
            //the last child of the loop is adding sequence to the next node in addTaskToBpmn()
            if(isLastChild){ 
                isLastChildFlag = true; 
                await traverseAndPrint(child,' ');
                isLastChildFlag = false;
            }else{
                await traverseAndPrint(child,' ');
            }
            
        } else if(child.nodeName === 'parallel'){
            await handleParallel(child,indent,true);
        }    
        else if (child.nodeName === 'choose') {
            if (!isLastChild) {
                //child parallel sets sequence from its converging to the next node id instead of fathers converging node (if its last node)
                
                const gateways = await handleDecision(child, indent + '  ',true);
                const divergingID = gateways[0];
                previousNodeId = divergingID;
            }else{
                const gateways = await handleDecision(child, indent + '  ',true);
            }
    
        }else{
            await traverseAndPrint(child,' ');
        }
        if(isLastChild && child.nodeName !== 'loop'){
            isLastChildFlag = true;
            await addSequenceToBpmn(previousNodeId,divergingXORID);
            //currentNodeID = divergingXORID;
            isLastChildFlag = false;
        }
    }
    let parentsLastChild = getLastChildElement(node.parentNode)===node;

    if(!(youarenested&&parentsLastChild)){
        divergingGateway.setAttribute('default',await addSequenceToBpmn(divergingXORID,nextNodeID));
    }else if(!youarenested&&parentsLastChild){
        divergingGateway.setAttribute('default',await addSequenceToBpmn(divergingXORID,nextNodeID));
    }
    return divergingXORID;
}

export async function handleParallel(node, indent,youarenested) {
    const divergingID = await addDivergingToBpmn();
    const convergingID = await addConvergingToBpmn();

    if (!divergingID || !convergingID) {
        console.error("Error: Could not create diverging or converging gateways.");
        return;
    }

    const divergingGateway = await findParallelGatewayById(divergingID);
    const convergingGateway = await findParallelGatewayById(convergingID);

    if (!divergingGateway || !convergingGateway) {
        console.error("Error: Diverging or converging gateways not found.");
        return;
    }

    // Process each parallel branch
    for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        if (child.nodeName === 'parallel_branch') {
            await handleParallelBranch(child, indent + '  ', divergingID, convergingID,youarenested);
        }
    }
    
    //here is the problem of redundant sequence addition to the end event!!!
    // Connect the converging gateway to the next node
    if(!youarenested){
        const outgoingSeqID = await addSequenceToBpmn(convergingID, nextNodeID);
        const outgoing = convergingGateway.getElementsByTagName('outgoing')[0];
        if (outgoing) {
            outgoing.textContent = outgoingSeqID;
        }
        previousSeqID = outgoingSeqID;
        previousNodeId = convergingID;
    }else{
        const parentNode = node.parentNode;
        const isLastChild = parentNode && (parentNode.nodeName === 'parallel_branch'
                                ||  parentNode.nodeName === 'loop'
                                ||(parentNode.nodeName === 'alternative'||parentNode.nodeName === 'otherwise')) && getLastChildElement(parentNode) === node ;
        
        if(!isLastChild){
            const outgoingSeqID = await addSequenceToBpmn(convergingID, nextNodeID);
            const outgoing = convergingGateway.getElementsByTagName('outgoing')[0];
            if (outgoing) {
                outgoing.textContent = outgoingSeqID;
            }
            previousSeqID = outgoingSeqID;
        }
        
        previousNodeId = convergingID;
        youarenested = false;
    }
   
    return {divergingID, convergingID};
}

async function handleParallelBranch(node, indent, divergingID, convergingID,youarenested) {
    if (node.nodeType !== 1) {
        return;
    }

    const parentNode = node.parentNode;
    const isFirstChild = parentNode && parentNode.nodeName === 'parallel_branch' && getFirstChildElement(parentNode) === node;
    const isLastChild = parentNode && parentNode.nodeName === 'parallel_branch' && getLastChildElement(parentNode) === node ;

    if (isFirstChild) {
        const outgoingSeqID = await addSequenceToBpmn(divergingID, nextNodeID);
        const divergingGateway = await findParallelGatewayById(divergingID);
        previousSeqID = outgoingSeqID;

        if (divergingGateway) {
            const outgoingElement = bpmnDoc.createElement('outgoing');
            const outgoingText = bpmnDoc.createTextNode(outgoingSeqID);
            outgoingElement.appendChild(outgoingText);
            divergingGateway.appendChild(outgoingElement);
        }
    }
    //wrong flow of the programm
    if (isLastChild) {
        isLastChildFlag = true;
        if (node.nodeName === 'parallel') {
            isLastChildFlag = false;
            const result = await handleParallel(node, indent+ '  ',true);
            isLastChildFlag = true;
            if (result) {
                const { divergingID: childDivergingID, convergingID: childConvergingID } = result;
                console.log("Stored divergingID:", divergingID);
                console.log("Stored convergingID:", convergingID);
                previousNodeId = childConvergingID;
                const outgoingSeqID = await addSequenceToBpmn(previousNodeId, convergingID);
                const convergingGateway = await findParallelGatewayById(convergingID);
                previousSeqID = outgoingSeqID;
                if (convergingGateway) {
                    const incomingElement = bpmnDoc.createElement('incoming');
                    const incomingText = bpmnDoc.createTextNode(outgoingSeqID);
                    incomingElement.appendChild(incomingText);
                    convergingGateway.appendChild(incomingElement);
                }
                // Use divergingID and convergingID as needed
            } else {
                console.error("Error: handleParallel did not return a valid result.");
            }
        } else if (node.nodeName === 'choose') {
            isLastChildFlag = false;
            const result = await handleDecision(node, indent+ '  ',true);
            isLastChildFlag = true;
            if (result) {
                const { divergingID: childDivergingID, convergingID: childConvergingID } = result;
                console.log("Stored divergingID:", divergingID);
                console.log("Stored convergingID:", convergingID);
                previousNodeId = childConvergingID;
                const outgoingSeqID = await addSequenceToBpmn(previousNodeId, convergingID);
                const convergingGateway = await findParallelGatewayById(convergingID);
                previousSeqID = outgoingSeqID;
                if (convergingGateway) {
                    const incomingElement = bpmnDoc.createElement('incoming');
                    const incomingText = bpmnDoc.createTextNode(outgoingSeqID);
                    incomingElement.appendChild(incomingText);
                    convergingGateway.appendChild(incomingElement);
                }
                // Use divergingID and convergingID as needed
            } else {
                console.error("Error: handleParallel did not return a valid result.");
            }
        }else if(node.nodeName === 'loop'){
            isLastChildFlag = false;
            const exitXorId = await handleLoop(node, indent+ '  ',true);
            isLastChildFlag = true;
            if (exitXorId) {
                console.log("Stored exitXorId:", exitXorId);
                previousNodeId = exitXorId;
                const exitXOR = await findXORGatewayById(exitXorId);
                const outgoingSeqID = await addSequenceToBpmn(previousNodeId, convergingID);
                exitXOR.setAttribute('default',outgoingSeqID);
                const convergingGateway = await findParallelGatewayById(convergingID);
                previousSeqID = outgoingSeqID;
                if (convergingGateway) {
                    const incomingElement = bpmnDoc.createElement('incoming');
                    const incomingText = bpmnDoc.createTextNode(outgoingSeqID);
                    incomingElement.appendChild(incomingText);
                    convergingGateway.appendChild(incomingElement);
                }
            } else {
                console.error("Error: handleParallel did not return a valid result.");
            }
        }else if(node.nodeName !== 'terminate'){
            const outgoingSeqID = await addSequenceToBpmn(nextNodeID, convergingID);
            const convergingGateway = await findParallelGatewayById(convergingID);
            previousSeqID = outgoingSeqID;

            if (convergingGateway) {
                const incomingElement = bpmnDoc.createElement('incoming');
                const incomingText = bpmnDoc.createTextNode(outgoingSeqID);
                incomingElement.appendChild(incomingText);
                convergingGateway.appendChild(incomingElement);
            }
        }
    } 
   
    if (node.nodeName === 'call') {
        await handleCall(node, indent + '  ');
    }else if(node.nodeName === 'manipulate'){
        await handleManipulate(node,indent);
    } else if (node.nodeName === 'parallel') {
        if (!isLastChild) {
            //child parallel sets sequence from its converging to the next node id instead of fathers converging node (if its last node)
            const gateways = await handleParallel(node, indent + '  ',true);
        }

    } else if(node.nodeName === 'loop'){
        // for the loop which is the last child of the parallel branch, all the necessary procedures have been processed in this function just before
        if(!isLastChild){
            await handleLoop(node,indent,true);
        }
    }else if (node.nodeName === 'choose') {
        if (!isLastChild) {
            //child parallel sets sequence from its converging to the next node id instead of fathers converging node (if its last node)
            const gateways = await handleDecision(node, indent + '  ',true);
            const divergingID = gateways[0];
            previousNodeId = divergingID;
        }

    }else if(node.nodeName==='parallel_branch'){
        let childrenNumber = getNumberOfChildrenElements(node);
        if(childrenNumber===0){
            previousSeqID = addSequenceToBpmn(divergingID,convergingID);
        }
        for (let i = 0; i < node.childNodes.length; i++) {
            await handleParallelBranch(node.childNodes[i], indent + '  ', divergingID, convergingID);
        }
    } else if(node.nodeName==='terminate'){
        addEndEvent();
    } else if(node.nodeName === 'stop'){
        addIntermediateCatchEvent('signal',"");
    }
    isLastChildFlag = false; // Reset the flag after processing
}

export async function handleDecision(node, indent,youarenested) {
    const divergingID = await addXORToBpmn("Diverging");
    const convergingID = await addXORToBpmn("Converging");

    if (!divergingID || !convergingID) {
        console.error("Error: Could not create diverging or converging gateways.");
        return;
    }
    //sorun burada
    const divergingGateway = await findXORGatewayById(divergingID);
    const convergingGateway = await findXORGatewayById(convergingID);

    if (!divergingGateway || !convergingGateway) {
        console.error("Error: Diverging or converging gateways not found.");
        return;
    }

    // Process each decision branch
    for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        if (child.nodeName === 'alternative'||child.nodeName === 'otherwise') {
            await handleDecisionBranch(child, indent + '  ', divergingID, convergingID,youarenested);
        }
    }
    
    //here is the problem of redundant sequence addition to the end event!!!
    // Connect the converging gateway to the next node
    if(!youarenested){
        const outgoingSeqID = await addSequenceToBpmn(convergingID, nextNodeID);
        const outgoing = convergingGateway.getElementsByTagName('outgoing')[0];
        if (outgoing) {
            outgoing.textContent = outgoingSeqID;
        }
        previousSeqID = outgoingSeqID;
        previousNodeId = convergingID;
    }else{
        const parentNode = node.parentNode;
        
        const isLastChild = (parentNode && parentNode.nodeName === 'parallel_branch' && getLastChildElement(parentNode) === node)
                                || (parentNode && parentNode.nodeName === 'loop' && getLastChildElement(parentNode) === node)
                                || (parentNode && (parentNode.nodeName === 'alternative'||parentNode.nodeName === 'otherwise')&& getLastChildElement(parentNode) === node) ;
        
        if(!isLastChild){
            const outgoingSeqID = await addSequenceToBpmn(convergingID, nextNodeID);
            const outgoing = convergingGateway.getElementsByTagName('outgoing')[0];
            if (outgoing) {
                outgoing.textContent = outgoingSeqID;
            }
            previousSeqID = outgoingSeqID;
        }
        
        previousNodeId = convergingID;
    }
   
    return {divergingID, convergingID};
}

async function handleDecisionBranch(node, indent, divergingID, convergingID,youarenested) {
    if (node.nodeType !== 1) {
        return;
    }
    
    const parentNode = node.parentNode;
    const isFirstChild = parentNode && (parentNode.nodeName === 'alternative'||parentNode.nodeName === 'otherwise') && getFirstChildElement(parentNode) === node;
    const isLastChild = parentNode && (parentNode.nodeName === 'alternative'||parentNode.nodeName === 'otherwise') && getLastChildElement(parentNode) === node ;
    const divergingGateway = await findXORGatewayById(divergingID);
    
    if (isFirstChild) {
        const outgoingSeqID = await addSequenceToBpmn(divergingID, nextNodeID);
        if(parentNode.nodeName === 'alternative'){
            let chooseCondition = parentNode.getAttribute('condition');
            const conditionSeq = await findSequenceFlowById(outgoingSeqID);
            const conditionElement = bpmnDoc.createElement('conditionExpression');
            const conditionText = bpmnDoc.createTextNode(chooseCondition);
            conditionSeq.setAttribute('name',chooseCondition);
            const conditionId = generatePaddedUniqueId();
            counter++;
            conditionElement.setAttribute('id',conditionId);
            conditionElement.setAttribute('xsi:type',"tFormalExpression");
            conditionElement.appendChild(conditionText);
            conditionSeq.appendChild(conditionElement);
        }else if(parentNode.nodeName==='otherwise'){
            divergingGateway.setAttribute('default',outgoingSeqID);    
        }
        
        previousSeqID = outgoingSeqID;

        if (divergingGateway) {
            const outgoingElement = bpmnDoc.createElement('outgoing');
            const outgoingText = bpmnDoc.createTextNode(outgoingSeqID);
            outgoingElement.appendChild(outgoingText);
            divergingGateway.appendChild(outgoingElement);
        }
    }
    //wrong flow of the programm
    if (isLastChild) {
        isLastChildFlag = true;
        if (node.nodeName === 'choose') {
            isLastChildFlag = false;
            const result = await handleDecision(node, indent+ '  ',true);
            isLastChildFlag = true;
            if (result) {
                const { divergingID: childDivergingID, convergingID: childConvergingID } = result;
                console.log("Stored divergingID:", divergingID);
                console.log("Stored convergingID:", convergingID);
                previousNodeId = childConvergingID;
                const outgoingSeqID = await addSequenceToBpmn(previousNodeId, convergingID);
                const convergingGateway = await findParallelGatewayById(convergingID);
                previousSeqID = outgoingSeqID;
                if (convergingGateway) {
                    const incomingElement = bpmnDoc.createElement('incoming');
                    const incomingText = bpmnDoc.createTextNode(outgoingSeqID);
                    incomingElement.appendChild(incomingText);
                    convergingGateway.appendChild(incomingElement);
                }
                // Use divergingID and convergingID as needed
            } else {
                console.error("Error: handleParallel did not return a valid result.");
            }
           
        }else if (node.nodeName === 'parallel') {
            isLastChildFlag = false;
            const result = await handleParallel(node, indent+ '  ',true);
            isLastChildFlag = true;
            if (result) {
                const { divergingID: childDivergingID, convergingID: childConvergingID } = result;
                console.log("Stored divergingID:", divergingID);
                console.log("Stored convergingID:", convergingID);
                previousNodeId = childConvergingID;
                const outgoingSeqID = await addSequenceToBpmn(previousNodeId, convergingID);
                const convergingGateway = await findParallelGatewayById(convergingID);
                previousSeqID = outgoingSeqID;
                if (convergingGateway) {
                    const incomingElement = bpmnDoc.createElement('incoming');
                    const incomingText = bpmnDoc.createTextNode(outgoingSeqID);
                    incomingElement.appendChild(incomingText);
                    convergingGateway.appendChild(incomingElement);
                }
                // Use divergingID and convergingID as needed
            } else {
                console.error("Error: handleParallel did not return a valid result.");
            }
           
        } else if(node.nodeName === 'loop'){
            isLastChildFlag = false;
            const exitXorId = await handleLoop(node, indent+ '  ',true);
            isLastChildFlag = true;
            if (exitXorId) {
                console.log("Stored exitXorId:", exitXorId);
                previousNodeId = exitXorId;
                const exitXOR = await findXORGatewayById(exitXorId);
                const outgoingSeqID = await addSequenceToBpmn(previousNodeId, convergingID);
                exitXOR.setAttribute('default',outgoingSeqID);
                const convergingGateway = await findParallelGatewayById(convergingID);
                previousSeqID = outgoingSeqID;
                if (convergingGateway) {
                    const incomingElement = bpmnDoc.createElement('incoming');
                    const incomingText = bpmnDoc.createTextNode(outgoingSeqID);
                    incomingElement.appendChild(incomingText);
                    convergingGateway.appendChild(incomingElement);
                }
            } else {
                console.error("Error: handleParallel did not return a valid result.");
            }
        }else if(node.nodeName !== 'terminate'){
            const outgoingSeqID = await addSequenceToBpmn(nextNodeID, convergingID);
            const convergingGateway = await findParallelGatewayById(convergingID);
            previousSeqID = outgoingSeqID;

            if (convergingGateway) {
                const incomingElement = bpmnDoc.createElement('incoming');
                const incomingText = bpmnDoc.createTextNode(outgoingSeqID);
                incomingElement.appendChild(incomingText);
                convergingGateway.appendChild(incomingElement);
            }
        } 
        
    } 
    if (node.nodeName === 'call') {
        await handleCall(node, indent + '  ');
    } else if(node.nodeName === 'manipulate'){
        await handleManipulate(node,indent);
    }else if (node.nodeName === 'parallel') {
        if (!isLastChild) {
            //child parallel sets sequence from its converging to the next node id instead of fathers converging node (if its last node)
            const gateways = await handleParallel(node, indent + '  ',true);
            const divergingID = gateways[0];
            previousNodeId = divergingID;
        }
    } else if(node.nodeName === 'loop'){
        // for the loop which is the last child of the parallel branch, all the necessary procedures have been processed in this function just before
        if(!isLastChild){
            await handleLoop(node,indent,true);
        }
    }else if (node.nodeName === 'choose') {
        if (!isLastChild) {
            //child parallel sets sequence from its converging to the next node id instead of fathers converging node (if its last node)
            
            const gateways = await handleDecision(node, indent + '  ',true);
            const divergingID = gateways[0];
            previousNodeId = divergingID;
        }
    }else if (node.nodeName === 'terminate') {
        await addEndEvent();
    }else if(node.nodeName === 'stop'){
        addIntermediateCatchEvent('signal',"");
    }else{
        if(node.nodeName==='alternative'||node.nodeName==='otherwise'){
            let childrenNumber = getNumberOfChildrenElements(node);
            if(childrenNumber===0){
                previousSeqID = await addSequenceToBpmn(divergingID,convergingID);
                if(node.nodeName === 'alternative'){
                    let chooseCondition = node.getAttribute('condition');
                    const conditionSeq = await findSequenceFlowById(previousSeqID);
                    const conditionElement = bpmnDoc.createElement('conditionExpression');
                    const conditionText = bpmnDoc.createTextNode(chooseCondition);
                    conditionSeq.setAttribute('name',chooseCondition);
                    const conditionId = generatePaddedUniqueId();
                    counter++;
                    conditionElement.setAttribute('id',conditionId);
                    conditionElement.setAttribute('xsi:type',"tFormalExpression");
                    conditionElement.appendChild(conditionText);
                    conditionSeq.appendChild(conditionElement);
                }else if(node.nodeName==='otherwise'){
                    divergingGateway.setAttribute('default',previousSeqID);    
                }
            }
            for (let i = 0; i < node.childNodes.length; i++) {
                await handleDecisionBranch(node.childNodes[i], indent + '  ', divergingID, convergingID);
            }
        }
    }
    isLastChildFlag = false; // Reset the flag after processing
}

export async function handleCall(node, indent) {
    console.log(`${indent}Handling call:`);
    const attributes = node.attributes;
    const endpoint = node.getAttribute('endpoint');
    let type;
   
    try {
        // Await the result from `getType()`
        const types = await getType(endpoint,endpoints);
        // `taskType` is a JSON string, so parse it to work with it
        if(types==='automatic'){
            addTaskToBpmn(node, 'automatic');
        }else if (types) {
            const parsedTypes = JSON.parse(types);
            console.log('Parsed Task type received from getType:', parsedTypes);
            if (parsedTypes.type) {
                switch(parsedTypes.type){
                    case 'event':{
                            if(parsedTypes.resource){
                                console.log(parsedTypes.resource);
                                handleEvent(node,parsedTypes.resource);
                            }
                            break;
                        }
                    case 'task':{
                        switch(parsedTypes.resource){
                            case 'automatic':
                                addTaskToBpmn(node, 'automatic');
                                break;
                            case 'user':
                                addTaskToBpmn(node, 'userTask');
                                break;
                            default:
                                addTaskToBpmn(node,'automatic');
                                break;
                        }
                        break;
                    }
                    default:{
                        addTaskToBpmn(node,'automatic');
                        break;
                    }
                }
                console.log('The value of type:', parsedTypes.type);
            }else if(parsedTypes.resource){
                switch(parsedTypes.resource){
                    case 'automatic':
                        addTaskToBpmn(node, 'automatic');
                        break;
                    case 'user':
                        addTaskToBpmn(node, 'userTask');
                        break;
                    default:
                        addTaskToBpmn(node,'automatic');
                        break;
                }
            }
        } else {
            console.error('No valid task type found for the endpoint');
            await addTaskToBpmn(node);
        }
    } catch (error) {
        console.error('Error occurred while getting task type:', error.message);
        //return;
    }
   
    for (let i = 0; i < node.childNodes.length; i++) {
        await traverseAndPrint(node.childNodes[i], indent + '  ');
    }
}

export async function handleEvent(node, resource) {
    
    //more to call: addIntermediateThrowingEvent, addStartStandardEvent('Message')
    //label as child
    const label = await getLabelTextFromCall(node);
    switch(resource){
        case 'timer':
            await addIntermediateCatchEvent('timer',label);
            break;
        case 'receive':
        case 'send':
            await addIntermediateCatchEvent('message',label);
            break;
        default:
            await addIntermediateCatchEvent('timer',label);
            break;
    }
   
    for (let i = 0; i < node.childNodes.length; i++) {
        await traverseAndPrint(node.childNodes[i], '  ');
    }
}

export async function handleManipulate(node, indent) {
    const attributes = node.attributes;
    await addTaskToBpmn(node,'manipulate');
   
    for (let i = 0; i < node.childNodes.length; i++) {
        await traverseAndPrint(node.childNodes[i], indent + '  ');
    }
}

export async function processEndpoints(node, indent) {
    console.log(`${indent}Processing endpoints:`);
    endpoints = node.getElementsByTagName('endpoints');
}

async function addXORToBpmn(gatewayType) {
    try {
        const processNode = bpmnDoc.getElementsByTagName('process')[0];
        if (!processNode) {
            throw new Error('<process> node not found in the BPMN document.');
        }

        console.log('Appending diverging gateway to BPMN process node...');
        
        // Import the sequence node
        const importedNode = bpmnDoc.importNode(XORGatewayDoc.documentElement, true);
        
        let currentNodeID = nextNodeID;
        counter++;
        nextNodeID = generatePaddedUniqueId();
        previousNodeId = currentNodeID;

        importedNode.setAttribute('id', currentNodeID);
        //importedNode.setAttribute('name', currentNodeID);
        switch(gatewayType){
            case "Diverging":
                importedNode.setAttribute('gatewayDirection', "Diverging");
                break;
            case "Converging":
                importedNode.setAttribute('gatewayDirection', "Converging");
                break;
            default:
                importedNode.setAttribute('gatewayDirection', "Diverging");
                break;
        }
        
        processNode.appendChild(importedNode);

        const incoming = importedNode.getElementsByTagName('incoming')[0];
        if (incoming) {
            incoming.textContent = previousSeqID;
        }

        console.log(`Appended node: ${taskDoc.documentElement.nodeName}`);
        console.log('Task nodes appended successfully.');
        return currentNodeID;
    } catch (error) {
        console.error('Error while adding task to BPMN:', error);
        throw error;
    }
}

async function addDivergingToBpmn() {
    try {
        const processNode = bpmnDoc.getElementsByTagName('process')[0];
        if (!processNode) {
            throw new Error('<process> node not found in the BPMN document.');
        }

        console.log('Appending diverging gateway to BPMN process node...');
        
        // Import the sequence node
        const importedNode = bpmnDoc.importNode(parallelGatewayDoc.documentElement, true);
        
        let currentNodeID = nextNodeID;
        counter++;
        nextNodeID = generatePaddedUniqueId();
        previousNodeId = currentNodeID;

        importedNode.setAttribute('id', currentNodeID);
        //importedNode.setAttribute('name', currentNodeID);
        importedNode.setAttribute('gatewayDirection', "Diverging");
        
        processNode.appendChild(importedNode);

        const incoming = importedNode.getElementsByTagName('incoming')[0];
        if (incoming) {
            incoming.textContent = previousSeqID;
        }

        console.log(`Appended node: ${taskDoc.documentElement.nodeName}`);
        console.log('Task nodes appended successfully.');
        return currentNodeID;
    } catch (error) {
        console.error('Error while adding task to BPMN:', error);
        throw error;
    }
}

async function addConvergingToBpmn() {
    try {
        const processNode = bpmnDoc.getElementsByTagName('process')[0];
        if (!processNode) {
            throw new Error('<process> node not found in the BPMN document.');
        }

        console.log('Appending converging gateway to BPMN process node...');
        
        // Import the sequence node
        const importedNode = bpmnDoc.importNode(parallelGatewayDoc.documentElement, true);
        
        let currentNodeID = nextNodeID;
        counter++;
        nextNodeID = generatePaddedUniqueId();
        previousNodeId = currentNodeID;

        importedNode.setAttribute('id', currentNodeID);
        //importedNode.setAttribute('name', currentNodeID);
        importedNode.setAttribute('gatewayDirection', "Converging");
        
        processNode.appendChild(importedNode);

        console.log(`Appended node: ${taskDoc.documentElement.nodeName}`);
        console.log('Task nodes appended successfully.');
        return currentNodeID;
    } catch (error) {
        console.error('Error while adding task to BPMN:', error);
        throw error;
    }
}

// Utility function to get the first child element node
function getLastChildElement(parentNode) {
    let child = parentNode.lastChild;
    while (child) {
        if (child.nodeType === 1 && 
            (child.nodeName === 'stop' ||child.nodeName === 'call' || child.nodeName === 'terminate' || child.nodeName === 'manipulate'|| child.nodeName === 'parallel' || child.nodeName === 'loop' || child.nodeName === 'choose')) {
            return child;  // Return the valid child node
        }
        child = child.previousSibling;  // Move to the previous sibling if the current is not valid
    }
    
    return child;
}

function getNumberOfChildrenElements(parentNode) {
    let numberOfChildren = 0;
    let child = parentNode.lastChild;
    while (child) {
        if (child.nodeType === 1 && 
            (child.nodeName === 'stop' || child.nodeName === 'call' || child.nodeName === 'parallel' || child.nodeName === 'loop' || child.nodeName === 'choose'||child.nodeName === 'terminate'||child.nodeName === 'manipulate')) {
            numberOfChildren++;  // Return the valid child node
        }
        child = child.previousSibling;  // Move to the previous sibling if the current is not valid
    }
    
    return numberOfChildren;
}
// Utility function to get the first child element node
function getFirstChildElement(parentNode) {
    let child = parentNode.firstChild;
    while (child) {
        if (child.nodeType === 1 && 
            (child.nodeName === 'stop' ||child.nodeName === 'call' || child.nodeName === 'terminate' || child.nodeName === 'parallel' || child.nodeName === 'loop' || child.nodeName === 'choose'||child.nodeName === 'manipulate')) {
            return child;  // Return the valid child node
        }
        child = child.nextSibling;  // Move to the previous sibling if the current is not valid
    }
    return child;
}

async function findParallelGatewayById(id) {
    const parallelGateways = bpmnDoc.getElementsByTagName('parallelGateway');
    console.log(`Searching for parallelGateway with id=${id}`);
    for (let i = 0; i < parallelGateways.length; i++) {
        console.log(`Checking parallelGateway with id=${parallelGateways[i].getAttribute('id')}`);
        if (parallelGateways[i].getAttribute('id') === id) {
            console.log(`parallelGateway found with id=${id}`);
            return parallelGateways[i];
        }
    }
    console.log(`parallelGateway not found with id=${id}`);
    return null;
}

async function findXORGatewayById(id) {
    const xorGateways = bpmnDoc.getElementsByTagName('exclusiveGateway');
    console.log(`Searching for parallelGateway with id=${id}`);
    for (let i = 0; i < xorGateways.length; i++) {
        console.log(`Checking xorGateway with id=${xorGateways[i].getAttribute('id')}`);
        if (xorGateways[i].getAttribute('id') === id) {
            console.log(`parallelGateway found with id=${id}`);
            return xorGateways[i];
        }
    }
    console.log(`parallelGateway not found with id=${id}`);
    return null;
}

async function findSequenceFlowById(id) {
    const sequenceFlows = bpmnDoc.getElementsByTagName('sequenceFlow');
    console.log(`Searching for sequenceFlow with id=${id}`);
    for (let i = 0; i < sequenceFlows.length; i++) {
        console.log(`Checking sequence flow with id=${sequenceFlows[i].getAttribute('id')}`);
        if (sequenceFlows[i].getAttribute('id') === id) {
            console.log(`sequence flow found with id=${id}`);
            return sequenceFlows[i];
        }
    }
    console.log(`parallelGateway not found with id=${id}`);
    return null;
}

async function addSequenceToBpmn(from, to) {
    try {
        const processNode = bpmnDoc.getElementsByTagName('process')[0];
        if (!processNode) {
            throw new Error('<process> node not found in the BPMN document.');
        }

        console.log('Appending sequences to BPMN process node...');
        
        // Import the sequence node
        const importedNode = bpmnDoc.importNode(sequenceDoc.documentElement, true);
        
        // Generate a unique sequence ID
        const currentSeqID = generatePaddedUniqueSeqId();
        seqCounter++;

        // Set the required attributes
        importedNode.setAttribute('id', currentSeqID);
        importedNode.setAttribute('sourceRef', from);
        importedNode.setAttribute('targetRef', to);
        if(importedNode.getAttribute('sourceRef')==='undefined'){
            const a =1;
        }
        // Append the imported node to the process node
        processNode.appendChild(importedNode);
        
        console.log(`Appended node: ${sequenceDoc.documentElement.nodeName}`);
        console.log('Sequence nodes appended successfully.');
        
        return currentSeqID;
    } catch (error) {
        console.error('Error while adding sequence to BPMN:', error);
        throw error;
    }
}

//to develop: manipulate
async function getLabelTextFromCall(callNode) {
    const parametersNode = callNode.getElementsByTagName('parameters')[0];
    
    if (parametersNode) {
         const labelNode = parametersNode.getElementsByTagName('label')[0];
      if (labelNode) {
        return labelNode.textContent;
      } else {
        console.error("Label node not found");
      }
    } else {
      console.error("Parameters node not found");
    }
    return null;
}

async function getScriptTextFromCall(callNode) {
    const codeNode = callNode.getElementsByTagName('code')[0];
    if (codeNode) {
        let finalizeNode = codeNode.getElementsByTagName('finalize')[0];
        let updateNode = codeNode.getElementsByTagName('update')[0];
        let rescueNode = codeNode.getElementsByTagName('rescue')[0];
        if(finalizeNode&&finalizeNode.textContent!==""){
            return finalizeNode.textContent;
        } else if(updateNode&&updateNode.textContent!==""){
            return updateNode.textContent;
        } else if(rescueNode&&rescueNode.textContent!==""){
            return rescueNode.textContent;
        }
    } else {
      console.error("Code node not found");
    }
    return null;
}

async function getScriptTextFromManipulate(callNode) {
    return callNode.textContent;
}

export async function initializeStartEvent() {
    const startEvent = bpmnDoc.getElementsByTagName('startEvent')[0];
    if (startEvent) {
        const startEventId = generatePaddedUniqueId();
        startEvent.setAttribute('id', startEventId);
        //startEvent.setAttribute('name', startEventId);
        counter++;
        nextNodeID = generatePaddedUniqueId();
        
        const outgoingSeqID = await addSequenceToBpmn(startEventId, nextNodeID);
        previousSeqID = outgoingSeqID;
        const outgoing = startEvent.getElementsByTagName('outgoing')[0];
        if (outgoing) {
            outgoing.textContent = outgoingSeqID;
        }
        previousNodeId = startEventId; // Set the previous node ID to the start event ID
        console.log(`Initialized start event with ID: ${startEventId}`);
    } else {
        console.error('<startEvent> tag not found in the BPMN document.');
    }
}

export async function setEndEvent() {
    const endEvent = bpmnDoc.getElementsByTagName('endEvent')[0];
    if (endEvent) {
        const endEventId = nextNodeID;
        endEvent.setAttribute('id', endEventId);
        //endEvent.setAttribute('name', endEventId);
        counter++;
        nextNodeID = generatePaddedUniqueId();
        const incoming = endEvent.getElementsByTagName('incoming')[0];
        if (incoming) {
            incoming.textContent = previousSeqID;
        }
        previousNodeId = endEventId; // Set the previous node ID to the end event ID
        console.log(`Set end event with ID: ${endEventId}`);
    } else {
        console.error('<endEvent> tag not found in the BPMN document.');
    }
}

export async function addEndEvent() {
    try {
        const processNode = bpmnDoc.getElementsByTagName('process')[0];
        if (!processNode) {
            throw new Error('<process> node not found in the BPMN document.');
        }

        console.log('Appending diverging gateway to BPMN process node...');
        
        // Import the sequence node
        const importedNode = bpmnDoc.importNode(endEventDoc.documentElement, true);
        
        let currentNodeID = nextNodeID;
        counter++;
        nextNodeID = generatePaddedUniqueId();
        previousNodeId = currentNodeID;

        importedNode.setAttribute('id', currentNodeID);
        //importedNode.setAttribute('name', currentNodeID);
        
        processNode.appendChild(importedNode);

        const incoming = importedNode.getElementsByTagName('incoming')[0];
        if (incoming) {
            incoming.textContent = previousSeqID;
        }
        let terminateId = generatePaddedUniqueId();
        counter++;
        const terminateEventDef = xmlDoc.createElement('terminateEventDefinition');
        
        terminateEventDef.setAttribute('id', terminateId);
  
        // Append the new element as a child of <endEvent>
        importedNode.appendChild(terminateEventDef);

        console.log(`Appended node: ${taskDoc.documentElement.nodeName}`);
        console.log('Task nodes appended successfully.');
        return currentNodeID;
    } catch (error) {
        console.error('Error while adding task to BPMN:', error);
        throw error;
    }
}

export async function addIntermediateCatchEvent(resource,label) {
    try {
        const processNode = bpmnDoc.getElementsByTagName('process')[0];
        if (!processNode) {
            throw new Error('<process> node not found in the BPMN document.');
        }

        console.log('Appending diverging gateway to BPMN process node...');
        
        // Import the sequence node
        const importedNode = bpmnDoc.importNode(catchingIntermediateEventDoc.documentElement, true);
        
        let currentNodeID = nextNodeID;
        counter++;
        nextNodeID = generatePaddedUniqueId();
        previousNodeId = currentNodeID;

        importedNode.setAttribute('id', currentNodeID);
        importedNode.setAttribute('name', label);
        
        processNode.appendChild(importedNode);

        const incoming = importedNode.getElementsByTagName('incoming')[0];
        if (incoming) {
            incoming.textContent = previousSeqID;
        }

        switch(resource){
            case 'timer':{
                let timerEventId = generatePaddedUniqueId();
                counter++;
                const timerEventDef = bpmnDoc.createElement('timerEventDefinition');
                timerEventDef.setAttribute('id', timerEventId);
                importedNode.appendChild(timerEventDef);
                break;
            }
            case 'message':{
                let messageEventId = generatePaddedUniqueId();
                counter++;
                const messageEventDef = bpmnDoc.createElement('messageEventDefinition');
                messageEventDef.setAttribute('id', messageEventId);
                importedNode.appendChild(messageEventDef);
                break;
            }
            case 'signal':{
                let messageEventId = generatePaddedUniqueId();
                counter++;
                const messageEventDef = bpmnDoc.createElement('signalEventDefinition');
                messageEventDef.setAttribute('id', messageEventId);
                importedNode.appendChild(messageEventDef);
                break;
            }
            default:{
                let timerEventId = generatePaddedUniqueId();
                counter++;
                const timerEventDef = bpmnDoc.createElement('timerEventDefinition');
                timerEventDef.setAttribute('id', timerEventId);
                importedNode.appendChild(timerEventDef);
                break;
            }
        }
        
        if(!isLastChildFlag){
            previousSeqID = addSequenceToBpmn(currentNodeID,nextNodeID);
        }
        console.log(`Appended node: ${taskDoc.documentElement.nodeName}`);
        console.log('Task nodes appended successfully.');
        return currentNodeID;
    } catch (error) {
        console.error('Error while adding task to BPMN:', error);
        throw error;
    }
}

async function handleTaskAsManipulate(taskNode,taskScript){
    let importedNode = bpmnDoc.importNode(scriptTaskDoc.documentElement,true);
    const script = importedNode.getElementsByTagName('script')[0];
    script.textContent = taskScript;
    //manipulate has its label as an attribute
    let label=taskNode.getAttribute('label');
    let idValue = taskNode.getAttribute("id");
    if(label!==null&&label!==''){
        importedNode.setAttribute('name',label);//idValue
    }else{
        importedNode.setAttribute('name',idValue);//idValue
    }
    return importedNode;
}


async function addTaskToBpmn(callNode,taskType) {
    try {
        const processNode = bpmnDoc.getElementsByTagName('process')[0];
        if (!processNode) {
            throw new Error('<process> node not found in the BPMN document.');
        }
        console.log('Appending tasks to BPMN process node...');
        let importedNode;
        let label;
        let idValue;
        let taskScript;
        switch(taskType){
            case 'automatic':
                importedNode = bpmnDoc.importNode(taskDoc.documentElement,true);
                taskScript = await getScriptTextFromCall(callNode);
                if(taskScript!=null){
                    importedNode = await handleTaskAsManipulate(callNode,taskScript);
                }
                //task and usertasks have the their label as child tag
                label = await getLabelTextFromCall(callNode);
                idValue = callNode.getAttribute("id");
                if(label!==null&&label!==''){
                    importedNode.setAttribute('name',label);//idValue
                }else{
                    importedNode.setAttribute('name',idValue);//idValue
                }
                break;
            case 'manipulate':
                importedNode = bpmnDoc.importNode(scriptTaskDoc.documentElement,true);
                const script = importedNode.getElementsByTagName('script')[0];
                script.textContent = await getScriptTextFromManipulate(callNode);
                //manipulate has its label as an attribute
                label=callNode.getAttribute('label');
                idValue = callNode.getAttribute("id");
                if(label!==null&&label!==''){
                    importedNode.setAttribute('name',label);//idValue
                }else{
                    importedNode.setAttribute('name',idValue);//idValue
                }
                break;
            case 'userTask':
                importedNode = bpmnDoc.importNode(userTaskDoc.documentElement,true);
                taskScript = await getScriptTextFromCall(callNode);
                if(taskScript!=null){
                    importedNode = await handleTaskAsManipulate(callNode,taskScript);
                }
                label = await getLabelTextFromCall(callNode);
                idValue = callNode.getAttribute("id");
                if(label!==null&&label!==''){
                    importedNode.setAttribute('name',label);//idValue
                }else{
                    importedNode.setAttribute('name',idValue);//idValue
                }
                break;
            default:
                importedNode = bpmnDoc.importNode(taskDoc.documentElement,true);
                taskScript = await getScriptTextFromCall(callNode);
                if(taskScript!=null){
                    importedNode = await handleTaskAsManipulate(callNode,taskScript);
                }
                label = await getLabelTextFromCall(callNode);
                idValue = callNode.getAttribute("id");
                if(label!==null&&label!==''){
                    importedNode.setAttribute('name',label);//idValue
                }else{
                    importedNode.setAttribute('name',idValue);//idValue
                }
                break;
        }
        
        
        let currentNodeID = nextNodeID;
        importedNode.setAttribute('id', currentNodeID);
        
        counter++;
        nextNodeID = generatePaddedUniqueId();
        
        previousNodeId = currentNodeID;
        processNode.appendChild(importedNode);
       
        
        const incoming = importedNode.getElementsByTagName('incoming')[0];
        if (incoming) {
            incoming.textContent = previousSeqID;
        }
        if(!isLastChildFlag) {

            const outgoingSeqID = await addSequenceToBpmn(currentNodeID, nextNodeID);
            const outgoing = importedNode.getElementsByTagName('outgoing')[0];       
            if (outgoing) {
                outgoing.textContent = outgoingSeqID;
            }
            previousSeqID = outgoingSeqID;
            
        }
        isLastChildFlag = false; // Reset the flag after skipping
        console.log(`Appended node: ${taskDoc.documentElement.nodeName}`);
        console.log('Task nodes appended successfully.');
    } catch (error) {
        console.error('Error while adding task to BPMN:', error);
        throw error;
    }
}