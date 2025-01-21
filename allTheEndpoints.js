const puppeteer = require('puppeteer');
const { fetchDynamicHTML, fetchXML } = require('./browserTrial2.js');

async function main() {
  const baseUrl = 'https://cpee.org/hub/?stage=development&dir=';
  const browser = await puppeteer.launch();
  const allTextNodes = new Set(); // Use a Set to store unique text nodes
  const uniqueJsonObjects = new Set(); // Use a Set to track unique JSON strings
  const jsonObjectStore = []; // Array to store unique JSON objects

  try {
    const rawHrefs = await fetchDynamicHTML(baseUrl, browser);
    console.log('All Raw Hrefs:', rawHrefs); // Print all raw hrefs

    for (const href of rawHrefs) {
      const fullUrl = new URL(href, baseUrl).href;
      console.log(`Fetching XML from: ${fullUrl}`);
      let xmlDoc;
      try {
        xmlDoc = await fetchXML(fullUrl);
      } catch (fetchError) {
        console.error(`Error fetching XML from ${fullUrl}:`, fetchError.message);
        continue; // Skip this iteration and move to the next URL
      }

      if (!xmlDoc) {
        console.warn(`Failed to fetch or parse XML from ${fullUrl}`);
        continue;
      }

      // Process the XML document
      const endpointsNode = xmlDoc.getElementsByTagName('endpoints')[0];
      if (endpointsNode) {
        const textNodes = [];
        traverseNodes(endpointsNode, textNodes);
        textNodes.forEach(textNode => allTextNodes.add(textNode)); // Add text nodes to the Set
        console.log('Text nodes under <endpoints>:', textNodes);
      } else {
        console.warn(`No <endpoints> node found in ${fullUrl}`);
      }
    }
  } finally {
    await browser.close();
  }

  const uniqueTextNodesArray = Array.from(allTextNodes); // Convert Set to Array if needed
  console.log('All unique text nodes collected:', uniqueTextNodesArray); // Print all unique text nodes

  for (const textNode of uniqueTextNodesArray) {
    const encodedTextNode = encodeURIComponent(textNode);
    //is it correct?
    const jsonUrl = `https://cpee.org/flow/resources/endpoints/${encodedTextNode}/properties.json`;
    console.log(`Fetching JSON from: ${jsonUrl}`);

    try {
      const response = await fetchJSON(jsonUrl);
      if (response) {
        const jsonString = JSON.stringify(response);
        if (!uniqueJsonObjects.has(jsonString)) {
          uniqueJsonObjects.add(jsonString);
          jsonObjectStore.push(response);
          console.log('Fetched and stored unique JSON:', response);
        } else {
          console.log('Duplicate JSON object skipped:', response);
        }
      }
    } catch (error) {
      console.error(`Error fetching JSON from ${jsonUrl}:`, error.message);
    }
  }

  console.log('All unique JSON objects:', jsonObjectStore);
}

async function fetchJSON(url) {
  try {
    const fetch = await import('node-fetch'); // Dynamic import for ESM
    const response = await fetch.default(url); // Use fetch.default because of dynamic import
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

main();
