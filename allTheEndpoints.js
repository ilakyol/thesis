//import fetch from 'node-fetch';

export async function getType(endpoint, endpoints) {
  // Check if `endpoints` is an iterable list (e.g., NodeList or array-like)
  if (endpoints && endpoints.length !== undefined) {
      if (endpoints.length === 0) {
          console.error('Endpoints NodeList is empty.');
          return;
      }
      endpoints = endpoints[0]; // Extract the first element
  }

  // Check if `endpoints` is defined and is an element node
  console.log(endpoints);
  console.log(endpoints.nodeType);
  if (!endpoints || endpoints.nodeType !== 1) {
      console.error('Endpoints is either undefined or is not an element node');
      return;
  }

  // Convert `childNodes` to an array and filter for element nodes (nodeType === 1)
  const endpointsChildren = Array.from(endpoints.childNodes).filter(child => child.nodeType === 1);
  
  if (endpointsChildren.length === 0) {
      console.error('Endpoints has no element children.');
      return;
  }

  // Iterate over the filtered children
  for (const [index, child] of endpointsChildren.entries()) {
    console.log(`Child ${index}: nodeName = ${child.nodeName}, localName = ${child.localName}, nodeType = ${child.nodeType}`);
    
    if (child.localName === endpoint) {
        console.log(`Match found for node: ${child.localName}`);
        let response = await getResponse(child.textContent);  // Await response to proceed sequentially
        console.log('Response:', response);
        return response;
    }
  }
}

async function getResponse(rawUrl){
  const encodedTextNode = encodeURIComponent(rawUrl);
    //is it correct?
    const jsonUrl = `https://cpee.org/flow/resources/endpoints/${encodedTextNode}/properties.json`;
    console.log(`Fetching JSON from: ${jsonUrl}`);

    try {
      const response = await fetchJSON(jsonUrl);
      if (response) {
        const jsonString = JSON.stringify(response);
        return jsonString;
      }
    } catch (error) {
      return 'automatic';
    }
}

async function fetchJSON(url) {
  try {
    console.log(fetch(url));
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (error.type === 'system') {
      console.error('Network error:', error.message);
    } else {
      console.error('Fetch error:', error.message);
    }
    throw error; // Rethrow error to be caught by the caller
  }
}

function traverseNodes(node, textNodes) {
  if (node.nodeType === 3) { // Text node
    const trimmedValue = node.nodeValue.trim();
    if (trimmedValue) {
      textNodes.push(trimmedValue);
    }
  }

  if (node.childNodes) { // Check if node.childNodes is not null
    for (let i = 0; i < node.childNodes.length; i++) {
      traverseNodes(node.childNodes[i], textNodes);
    }
  }
}

