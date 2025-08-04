// index.js

const express = require('express');
const { HttpAgent, Principal } = require('@dfinity/agent');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// The ICP network URL (e.g., mainnet, local replica)
const icpHost = process.env.ICP_HOST || 'https://icp-api.io';

// Create an ICP agent to interact with the network
const agent = new HttpAgent({ host: icpHost });

// Route to handle DID resolution requests
app.get('/1.0/identifiers/:did', async (req, res) => {
  const did = req.params.did;

  // Validate the DID format
  if (!did.startsWith('did:icp:')) {
    return res.status(400).json({ error: 'Invalid DID format' });
  }

  // Extract the canister principal ID from the DID
  const principalId = did.replace('did:icp:', '');
  let canisterPrincipal;

  try {
    canisterPrincipal = Principal.fromText(principalId);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid principal ID in DID' });
  }

  console.log(`Resolving DID for principal: ${canisterPrincipal.toText()}`);

  try {
    // --- THIS IS THE CORE LOGIC ---
    // Make a query call to the canister to get the DID Document
    // The canister must have a public `getDidDocument()` method.
    const didDocument = await agent.query({
      canisterId: canisterPrincipal,
      methodName: 'getDidDocument',
      arg: new ArrayBuffer(0), // No arguments for this method
    });

    // You would need to parse and format the response from the canister.
    // The format depends on how the canister returns the DID Document.
    // For this example, let's assume it returns a JSON string.
    const didDocumentJson = new TextDecoder().decode(didDocument.reply.arg);
    const formattedDidDocument = JSON.parse(didDocumentJson);

    // Return the DID Document
    res.status(200).json({
      didDocument: formattedDidDocument,
      didDocumentMetadata: {}, // You can add metadata here if needed
      didResolutionMetadata: {}, // You can add resolution-specific metadata here
    });

  } catch (error) {
    console.error(`Error resolving DID ${did}:`, error);

    if (error.message.includes('CanisterNotFound')) {
      return res.status(404).json({
        didResolutionMetadata: { error: 'notFound' },
        didDocument: null,
      });
    }

    // Default error response
    res.status(500).json({
      didResolutionMetadata: { error: 'serverError' },
      didDocument: null,
    });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`ICP DID driver listening at http://localhost:${port}`);
  console.log(`Universal Resolver will call: http://localhost:${port}/1.0/identifiers/did:icp:YOUR_PRINCIPAL_ID`);
});