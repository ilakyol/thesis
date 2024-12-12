import { promises as fs } from 'fs';

import { DOMParser, XMLSerializer } from 'xmldom';

import {traverseAndPrint, setEndEvent, initializeStartEvent, loadXmlFiles, setDocs , getBpmnDocFromHandler, processEndpoints} from './ElementHandler2.js';
import {setBpmnDocForLayout, calculateAndApplyLayout, getBpmnDocFromLayout}  from './LayoutCoordinateCalculator.js';
const basePath = './xmlFiles/cpeeXML/';
//cpeeXML/
// File name from the command line argument
const fileName = process.argv[2];

if (!fileName) {
    console.error('Please provide an XML file name as an argument.');
    process.exit(1);
}
const xmlFilePath = basePath + fileName;
const bpmnFilePath = './xmlFiles/basicBpmn.bpmn';
let xmlDoc;
let bpmnDoc;

main();
async function main() {
    try {
        await loadXmlBpmnFiles();
        await loadXmlFiles();
        await setDocs(xmlDoc,bpmnDoc);
        await initializeStartEvent();
        await processEndpoints(xmlDoc.documentElement);
        await traverseAndPrint(xmlDoc.documentElement);
        await setEndEvent();
        bpmnDoc = await getBpmnDocFromHandler();
        await setBpmnDocForLayout(bpmnDoc);
        await calculateAndApplyLayout();
        bpmnDoc = await getBpmnDocFromLayout();
        //const serializedBpmnDoc = await serializeXml(bpmnDoc);
        //await saveBpmnFile(serializedBpmnDoc);
    } catch (error) {
        console.error('Error:', error);
    }
}

async function loadXmlBpmnFiles(){
    const data = await fs.readFile(xmlFilePath, 'utf8');
    const dataBpmn = await fs.readFile(bpmnFilePath, 'utf8');
    const domParser = new DOMParser();
    xmlDoc = domParser.parseFromString(data, 'application/xml');
    bpmnDoc = domParser.parseFromString(dataBpmn, 'application/xml');
}





