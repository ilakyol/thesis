import graphviz from 'graphviz';

import {generatePaddedUniqueId} from './idGenerator.js';
import { promises as fs } from 'fs';
let bpmnDoc = null;

export async function setBpmnDocForLayout(doc) {
    bpmnDoc = doc;
}
import { DOMParser, XMLSerializer } from 'xmldom';

export async function getBpmnDocFromLayout(){
    return bpmnDoc;
}

export async function calculateAndApplyLayout() {
    const g = graphviz.digraph("G");
    g.setGraphVizPath('/opt/homebrew/bin');  // Adjust the path if Graphviz is installed elsewhere

    g.set("splines", "ortho");
    g.set("ranksep", "0.6"); 
    g.set("nodesep", "0.5");
    // Create nodes and edges in the graphviz graph
    const processNode = bpmnDoc.getElementsByTagName('process')[0];
    const startEvents = processNode.getElementsByTagName('startEvent');
    const taskElements = Array.from(processNode.getElementsByTagName('task'));
    const userTaskElements = Array.from(processNode.getElementsByTagName('userTask'));
    const scriptTaskElements = Array.from(processNode.getElementsByTagName('scriptTask'));
    const tasks = [...taskElements, ...userTaskElements, ...scriptTaskElements];
    const endEvents = processNode.getElementsByTagName('endEvent');
    const sequenceFlows = processNode.getElementsByTagName('sequenceFlow');
    const exclusiveGateways = processNode.getElementsByTagName('exclusiveGateway');
    const parallelGateways = processNode.getElementsByTagName('parallelGateway');
    const intermediateCatchingEvents = processNode.getElementsByTagName('intermediateCatchEvent');
    const pxToInches = (px) => px / 96;
    // Add startEvent nodes
    for (let i = 0; i < startEvents.length; i++) {
        const startEvent = startEvents[i];
        g.addNode(startEvent.getAttribute('id'), { shape: 'circle', width: '0.5', height: '0.5',fixedsize: 'true' });
    }
    // Add task nodes
    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const id = task.getAttribute('id');
        const width = pxToInches(100);
        const height = pxToInches(80);
        g.addNode(id, { shape: 'box', width: width, height: height, fixedsize: 'true' });
    }

    // Add endEvent nodes
    for (let i = 0; i < endEvents.length; i++) {
        const endEvent = endEvents[i];
        const nodeSizeInInches = pxToInches(36);
        g.addNode(endEvent.getAttribute('id'), { shape: 'circle', width: nodeSizeInInches, height: nodeSizeInInches,fixedsize: 'true' });
    }

    for (let i = 0; i < intermediateCatchingEvents.length; i++) {
        const intermediateCatchEvent = intermediateCatchingEvents[i];
        const nodeSizeInInches = pxToInches(36);
        g.addNode(intermediateCatchEvent.getAttribute('id'), { shape: 'circle', width: nodeSizeInInches, height: nodeSizeInInches,fixedsize: 'true' });
    }

    // Add sequenceFlow edges
    for (let i = 0; i < sequenceFlows.length; i++) {
        const sequenceFlow = sequenceFlows[i];
        const sourceRef = sequenceFlow.getAttribute('sourceRef');
        const targetRef = sequenceFlow.getAttribute('targetRef');
        const condition = sequenceFlow.getElementsByTagName('conditionExpression')[0];
        let edge;
        if(condition){
            let conditionText = condition.textContent;
            edge = g.addEdge(sourceRef, targetRef); //{ label: conditionText,}
        }else{
            edge = g.addEdge(sourceRef, targetRef);
        }
        edge.set('id', sequenceFlow.getAttribute('id')); // Store the sequenceFlow id in the edge
    }

    // Add exclusiveGateway nodes
    for (let i = 0; i < exclusiveGateways.length; i++) {
        const gateway = exclusiveGateways[i];
        const nodeSizeInInches = pxToInches(50);
        g.addNode(gateway.getAttribute('id'), { shape: 'diamond',width: nodeSizeInInches, height: nodeSizeInInches,fixedsize: 'true' });
    }

    // Add parallelGateway nodes
    for (let i = 0; i < parallelGateways.length; i++) {
        const gateway = parallelGateways[i];
        const nodeSizeInInches = pxToInches(50);
        g.addNode(gateway.getAttribute('id'), { shape: 'diamond',width: nodeSizeInInches, height: nodeSizeInInches,fixedsize: 'true' });
    }

    // Print the graph in DOT format
    const dotOutput = g.to_dot();
    

    // Set the correct Graphviz path
    try {
        g.setGraphVizPath('/opt/homebrew/bin');
    } catch (error) {
        console.error('Error setting GraphViz path:', error);
    }
    
    g.output("dot", (layout) => {
        fs.writeFile('output_graph.dot', layout, (error) => {
            if (error) {
                console.error('Error writing to file', error);
            } else {
                console.log('DOT format saved to output_graph.dot');
            }
        });
    });
    g.output("json", (layout) => {
        fs.writeFile('output.json', layout, (error) => {
            if (error) {
                console.error('Error writing to file', error);
            } else {
                console.log('DOT format saved to output_graph.dot');
            }
        });
    });
    g.output('svg', async (svgContent) => {
        fs.writeFile('output.svg', svgContent, (error) => {
            if (error) {
                console.error('Error writing to file', error);
            } else {
                console.log('DOT format saved to output_graph.dot');
            }
        });
    });

   
    // Calculate layout and apply it to the BPMN XML
    try {
        g.output("json", async (layout) => {
            
            const graph = JSON.parse(layout);
            
            // Find the maximum y-coordinate
            const maxY = Math.max(...graph.objects.map(node => parseFloat(node.pos.split(',')[1])));
            
            // Ensure the BPMNPlane element exists
            let bpmnPlane = bpmnDoc.getElementsByTagName('bpmndi:BPMNPlane')[0];
            if (!bpmnPlane) {
                let bpmnDiagram = bpmnDoc.getElementsByTagName('bpmndi:BPMNDiagram')[0];
                if (!bpmnDiagram) {
                    bpmnDiagram = bpmnDoc.createElement('bpmndi:BPMNDiagram');
                    bpmnDiagram.setAttribute('id', generatePaddedUniqueId());
                    bpmnDoc.documentElement.appendChild(bpmnDiagram);
                }
                bpmnPlane = bpmnDoc.createElement('bpmndi:BPMNPlane');
                bpmnPlane.setAttribute('bpmnElement', processNode.getAttribute('id'));
                bpmnPlane.setAttribute('id', generatePaddedUniqueId());
                bpmnDiagram.appendChild(bpmnPlane);
            }
    
            // Update BPMN XML with calculated coordinates
            graph.objects.forEach((node) => {
                // Parse the pos attribute to get x and y coordinates
                const pos = node.pos.split(',');
                const x = parseFloat(pos[0]);
                const y = (maxY - parseFloat(pos[1]));  // Invert y-coordinate
                const bpmnNode = bpmnDoc.getElementById(node.name);
                if (bpmnNode) {
                    let bpmnShape = null;
                    const bpmnShapes = bpmnDoc.getElementsByTagName('bpmndi:BPMNShape');
                    for (let i = 0; i < bpmnShapes.length; i++) {
                        if (bpmnShapes[i].getAttribute('bpmnElement') === node.name) {
                            bpmnShape = bpmnShapes[i];
                            break;
                        }
                    }
                    if (!bpmnShape) {
                        bpmnShape = bpmnDoc.createElement('bpmndi:BPMNShape');
                        bpmnShape.setAttribute('bpmnElement', node.name);
                        bpmnPlane.appendChild(bpmnShape);
                    }
    
                    let bounds = bpmnShape.getElementsByTagName('omgdc:Bounds')[0];
                    if (!bounds) {
                        bounds = bpmnDoc.createElement('omgdc:Bounds');
                        bpmnShape.appendChild(bounds);
                    }
                    
                    
                    switch(node.shape){
                        case "box":
                            bounds.setAttribute('width', 100);  // Adjust width as needed
                            bounds.setAttribute('height', 80);
                            bounds.setAttribute('x', x-50);
                            bounds.setAttribute('y', y-40);  // Adjust height as needed
                            break;
                        case "circle":
                            bounds.setAttribute('width', 36);  // Adjust width as needed
                            bounds.setAttribute('height', 36);  // Adjust height as needed
                            bounds.setAttribute('x', x-18);
                            bounds.setAttribute('y', y-18);
                            break;
                        case "diamond":
                            bounds.setAttribute('width', 50);  // Adjust width as needed
                            bounds.setAttribute('height', 50);  // Adjust height as needed
                            bounds.setAttribute('x', x-25);
                            bounds.setAttribute('y', y-25);
                            break;
                        default:
                            bounds.setAttribute('width', 100);  // Adjust width as needed
                            bounds.setAttribute('height', 80);  // Adjust height as needed
                            bounds.setAttribute('x', x-50);
                            bounds.setAttribute('y', y-40);
                            break;
                    }
                    
                }
            });
    
            // Set waypoints for edges
            graph.edges.forEach((edge) => {
                const bpmnElementId = edge.id;
                const processEdge = bpmnDoc.getElementById(bpmnElementId);
                const bpmnEdgeId = `${bpmnElementId}_gui`; // Generate id for BPMNEdge
                
                let bpmnEdge = bpmnDoc.getElementById(bpmnEdgeId);
                if (!bpmnEdge) {
                    bpmnEdge = bpmnDoc.createElement('bpmndi:BPMNEdge');
                    bpmnEdge.setAttribute('id', bpmnEdgeId);
                    bpmnEdge.setAttribute('bpmnElement', bpmnElementId);
                    bpmnPlane.appendChild(bpmnEdge);
                }
    
                const sourceNodeId = processEdge.getAttribute('sourceRef');
                const targetNodeId = processEdge.getAttribute('targetRef');
    
                const  sourceShapeElement = findShapebyElementId(sourceNodeId);
                const  targetShapeElement = findShapebyElementId(targetNodeId);
    
                // Clear existing waypoints
                while (bpmnEdge.firstChild) {
                    bpmnEdge.removeChild(bpmnEdge.firstChild);
                }
    
                // Retrieve the sequenceFlow element corresponding to the edge
                const sequenceFlow = Array.from(sequenceFlows).find(flow => flow.getAttribute('id') === bpmnElementId);
                if (!sequenceFlow) {
                    console.error(`Sequence flow not found for edge ${bpmnElementId}`);
                    return;
                }
               
                const points = edge._draw_[1].points;
                const uniquePoints = points.filter((point, index, self) =>
                    index === self.findIndex((p) => p[0] === point[0] && p[1] === point[1])
                );
                let x;
                let y;
                let correctedWaypoints = [];
                uniquePoints.forEach((point)=>{
                    x = parseFloat(point[0]);
                    
                    y = (maxY - parseFloat(point[1]));  
                    //let waypoint = bpmnDoc.createElement('omgdi:waypoint');
                    // waypoint.setAttribute('x', x);
                    // waypoint.setAttribute('y', y);
                    //bpmnEdge.appendChild(waypoint);
                    let correctedWaypoint = correctedWaypointInsideNode([x,y],sourceShapeElement,targetShapeElement);
                    correctedWaypoints.push(correctedWaypoint);
                });
                const uniquePoints2 = correctedWaypoints.filter((point, index, self) =>
                    index === self.findIndex((p) => p[0] === point[0] && p[1] === point[1])
                );
                uniquePoints2.forEach((point)=>{
                    x = parseFloat(point[0]);
                    y = parseFloat(point[1]); 
                    let waypoint = bpmnDoc.createElement('omgdi:waypoint');
                    waypoint.setAttribute('x', x);
                    waypoint.setAttribute('y', y);
                    bpmnEdge.appendChild(waypoint);
                });
            });
             const serializedBpmnDoc = serializeXml(bpmnDoc);
             await saveBpmnFile(serializedBpmnDoc);
        });
    } catch (error) {
        console.error('Error during graph output:', error);
    }
   
}

function correctedWaypointInsideNode(waypointCoor,sourceShapeElement,targetShapeElement){
    
    let sourceBounds = sourceShapeElement.getElementsByTagName('omgdc:Bounds')[0]; 
    const sourceX = parseFloat(sourceBounds.getAttribute('x'));
    const sourceY = parseFloat(sourceBounds.getAttribute('y'));
    const sourceWidth = parseFloat(sourceBounds.getAttribute('width'));
    const sourceHeight = parseFloat(sourceBounds.getAttribute('height'));
    
    let targetBounds = targetShapeElement.getElementsByTagName('omgdc:Bounds')[0]; 
    const targetX = parseFloat(targetBounds.getAttribute('x'));
    const targetY = parseFloat(targetBounds.getAttribute('y'));
    const targetWidth = parseFloat(targetBounds.getAttribute('width'));
    const targetHeight = parseFloat(targetBounds.getAttribute('height'));

    let insideSource = (sourceX - 5  <= waypointCoor[0] && waypointCoor[0] <= (sourceX + sourceWidth + 5)) &&
                                (sourceY - 5 <= waypointCoor[1] && waypointCoor[1] <= (sourceY + sourceHeight+5));
    if (insideSource) {
        return [sourceX + sourceWidth / 2, sourceY + sourceHeight / 2];
    }

    let insideTarget = (targetX -5 <= waypointCoor[0] && waypointCoor[0] <= targetX + targetWidth + 5) &&
                                (targetY -5 <= waypointCoor[1] && waypointCoor[1] <= targetY + targetHeight + 5);
    if (insideTarget) {
        return [targetX + targetWidth / 2, targetY + targetHeight / 2];
    }
    return waypointCoor;
}


function findShapebyElementId(id) {
    const shapes = bpmnDoc.getElementsByTagName('bpmndi:BPMNShape');
    
    for (let i = 0; i < shapes.length; i++) {
        
        if (shapes[i].getAttribute('bpmnElement') === id) {
            
            return shapes[i];
        }
    }
    console.log(`BPMN Shape not found with id=${id}`);
    return null;
}


function serializeXml(xmlDoc) {
    const serializer = new XMLSerializer();
    return serializer.serializeToString(xmlDoc);
}

async function saveBpmnFile(serializedBpmnDoc) {
    try {
        const outputFilePath = './xmlFiles/updatedBpmn.bpmn';
        await fs.writeFile(outputFilePath, serializedBpmnDoc, 'utf8');
        console.log(`BPMN document saved to ${outputFilePath}`);
    } catch (error) {
        console.error('Error saving BPMN document:', error);
        throw error;
    }
}