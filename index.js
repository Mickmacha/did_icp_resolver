// index.js (Node.js DID Resolver Driver)

const express = require('express');
const { HttpAgent, Principal } = require('@dfinity/agent');
const { IDL } = require('@dfinity/candid'); // Import IDL for encoding/decoding
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const icpHost = process.env.ICP_HOST || 'https://icp-api.io'; // Use local replica or mainnet
const DID_REGISTRY_CANISTER_ID = process.env.DID_REGISTRY_CANISTER_ID; // Your Motoko canister's principal ID

if (!DID_REGISTRY_CANISTER_ID) {
  console.error("DID_REGISTRY_CANISTER_ID environment variable is not set.");
  process.exit(1);
}

const agent = new HttpAgent({ host: icpHost });

// IMPORTANT: If you are running against a local replica, you need to fetch the root key.
// This is not necessary for mainnet or testnets.
if (icpHost.includes('127.0.0.1') || icpHost.includes('localhost')) {
  agent.fetchRootKey().catch(e => {
    console.warn("Unable to fetch root key. This may be expected if not running against a local replica:", e);
  });
}

app.get('/1.0/identifiers/:did', async (req, res) => {
  const did = req.params.did;

  if (!did.startsWith('did:icp:')) {
    return res.status(400).json({ error: 'Invalid DID format' });
  }

  const principalId = did.replace('did:icp:', '');
  let targetPrincipal;

  try {
    targetPrincipal = Principal.fromText(principalId); // Validate principal format
  } catch (e) {
    return res.status(400).json({ error: 'Invalid principal ID in DID' });
  }

  console.log(`Resolving DID for principal: ${targetPrincipal.toText()}`);

  try {
    // Encode the principalId string as Candid Text for the Motoko function
    const encodedArg = IDL.encode([IDL.Text], [principalId]);

    // Call the Motoko canister's getDidDocument method
    const response = await agent.query({
      canisterId: Principal.fromText(DID_REGISTRY_CANISTER_ID),
      methodName: 'getDidDocument',
      arg: encodedArg,
    });

    if (response.status === 'rejected') {
      console.error("Canister call rejected:", response.reject_message);
      return res.status(500).json({
        didResolutionMetadata: { error: 'canisterRejected', message: response.reject_message },
        didDocument: null,
      });
    }

    // Decode the response from the Motoko canister
    // The Motoko function returns ?Text, which decodes to an array [string] or []
    const decodedResult = IDL.decode([IDL.Opt(IDL.Text)], response.reply.arg);
    const didDocumentJson = decodedResult[0]; // Get the string or null/undefined

    if (!didDocumentJson) {
        return res.status(404).json({
            didResolutionMetadata: { error: 'notFound' },
            didDocument: null,
        });
    }

    const formattedDidDocument = JSON.parse(didDocumentJson);

    res.status(200).json({
      didDocument: formattedDidDocument,
      didDocumentMetadata: {},
      didResolutionMetadata: {},
    });

  } catch (error) {
    console.error(`Error resolving DID ${did}:`, error);

    // More specific error handling based on ICP agent errors
    if (error.message.includes('CanisterNotFound')) {
      return res.status(404).json({
        didResolutionMetadata: { error: 'notFound' },
        didDocument: null,
      });
    }
    // Add other error types like 'canisterError' if the canister traps

    res.status(500).json({
      didResolutionMetadata: { error: 'serverError', message: error.message },
      didDocument: null,
    });
  }
});

app.listen(port, () => {
  console.log(`ICP DID driver listening at http://localhost:${port}`);
  console.log(`Configured to query Motoko canister: ${DID_REGISTRY_CANISTER_ID}`);
});