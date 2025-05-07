import React, { useState, useEffect } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Box,
  Button,
  CircularProgress
} from "@mui/material";
import { ethers } from "ethers";

import WalletConnector from "./components/WalletConnector";
import TechnicianActions from "./components/TechnicianActions";
import AdminActions from "./components/AdminActions";
import AssetList from "./components/AssetList";
import IFCViewer from "./components/IFCViewer";
import FloatingAssetPanel from "./components/FloatingAssetPanel";

import {
  ASSET_MANAGER_ADDRESS,
  ASSET_MANAGER_ABI,
  PAYMENT_MANAGER_ADDRESS,
  PAYMENT_MANAGER_ABI,
  INFURA_WSS
} from "./config";

function App() {
  const [userAddress, setUserAddress] = useState("");
  const [userRole, setUserRole] = useState("Unregistered");

  // IFC picking
  const [selectedGlobalId, setSelectedGlobalId] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);

  // Asset storage
  const [assets, setAssets] = useState([]);
  const [globalIdToAsset, setGlobalIdToAsset] = useState({});

  // For the floating panel
  const [panelPos, setPanelPos] = useState({ x: 100, y: 100 });
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [debugInfo, setDebugInfo] = useState("");
  const [focusGlobalId, setFocusGlobalId] = useState(null); // NEW: which GlobalId should the IFC camera fly to?

  // Load assets on mount
  useEffect(() => {
    loadAssets();
  }, []);

  useEffect(() => {
    const wssUrl = INFURA_WSS;
    // or your actual wss endpoint
    const wssProvider = new ethers.providers.WebSocketProvider(wssUrl);

    const contract = new ethers.Contract(
      ASSET_MANAGER_ADDRESS,
      ASSET_MANAGER_ABI,
      wssProvider
    );

    // 1) FaultCanceled
    contract.on("FaultCancelled", (assetId, reason, event) => {
      console.log("FaultCancelled event:", assetId.toString(), reason);
      loadAssets(); // or any other logic
    });

    // 2) MaintenanceStarted
    contract.on("MaintenanceStarted", (id, tech, event) => {
      console.log("MaintenanceStarted event:", id.toString(), tech);
      loadAssets();
    });

    // 3) MaintenanceCompleted
    contract.on("MaintenanceCompleted", (id, tech, ts, event) => {
      console.log("MaintenanceCompleted event:", id.toString(), tech, ts.toString());
      loadAssets();
    });

    // 4) FaultReported
    contract.on("FaultReported", (assetId, status, faultType, event) => {
      console.log("FaultReported event:", assetId.toString(), status, faultType);
      loadAssets();
    });

    // Cleanup
    return () => {
      contract.removeAllListeners("FaultCancelled");
      contract.removeAllListeners("MaintenanceStarted");
      contract.removeAllListeners("MaintenanceCompleted");
      contract.removeAllListeners("FaultReported");
      wssProvider.destroy();
    };
  }, []);


  // UseEffect to check if the chosen globalId has a matching asset
  useEffect(() => {
    // If user hasn't clicked anything => do nothing
    if (!selectedGlobalId) {
      setSelectedAsset(undefined); // or null, or we can just not show
      return;
    }

    // We just "selected" a globalId. Mark asset=undefined so we know we're deciding
    setSelectedAsset(undefined);

    // See if it matches
    if (globalIdToAsset[selectedGlobalId]) {
      setSelectedAsset(globalIdToAsset[selectedGlobalId]);
    } else {
      setSelectedAsset(null);
    }
  }, [selectedGlobalId, globalIdToAsset]);

  // Called by IFCViewer
  const handleObjectSelected = (globalId, clientX, clientY) => {
    setSelectedGlobalId(globalId);
    setPanelPos({ x: clientX, y: clientY });
  };

  // Grab all assets from on-chain, store them in state
  const loadAssets = async () => {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();

      const assetManagerContract = new ethers.Contract(
        ASSET_MANAGER_ADDRESS,
        ASSET_MANAGER_ABI,
        signer
      );
      const paymentManagerContract = new ethers.Contract(
        PAYMENT_MANAGER_ADDRESS,
        PAYMENT_MANAGER_ABI,
        signer
      );

      const network = await provider.getNetwork();
      console.log("ChainId:", network.chainId);

      const total = await assetManagerContract.nextAssetId();
      const tempAssets = [];
      for (let i = 0; i < total; i++) {
        const assetStruct = await assetManagerContract.assets(i);
        const metaStruct = await assetManagerContract.assetMetadata(i);

        const parsedAsset = {
          id: assetStruct.id.toNumber(),
          isDeleted: assetStruct.isDeleted,
          technician: assetStruct.technician,
          lastMaintenanceTimestamp: assetStruct.lastMaintenanceTimestamp.toNumber(),
          status: assetStruct.status,
          faultType: assetStruct.faultType,

          // from metadata
          category: metaStruct.category,
          building: metaStruct.building,
          floor: metaStruct.floor.toNumber(),
          room: metaStruct.room.toNumber(),
          brand: metaStruct.brand,
          model: metaStruct.model,
          ipfsHash: metaStruct.ipfsHash,
          globalId: metaStruct.globalId,
          positionId: metaStruct.positionId,
          physicalId: metaStruct.physicalId
        };
        tempAssets.push(parsedAsset);
      }

      // Filter out any that are deleted
      const visibleAssets = tempAssets.filter((a) => !a.isDeleted);

      // Create the globalId -> asset map
      const map = {};
      for (const a of visibleAssets) {
        if (a.globalId) {
          map[a.globalId] = a;
        }
      }

      setAssets(visibleAssets);
      setGlobalIdToAsset(map);
    } catch (err) {
      console.error("Error loading assets from chain:", err);
      alert(err.message);
    } finally {
      setLoadingAssets(false);
    }
  };

  // For debugging, calls a contract function and logs something
  const debugCheckContract = async () => {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const assetManagerContract = new ethers.Contract(
        ASSET_MANAGER_ADDRESS,
        ASSET_MANAGER_ABI,
        signer
      );

      const nextIdBN = await assetManagerContract.nextAssetId();
      let debugString = `nextAssetId: ${nextIdBN.toString()}\n`;

      if (nextIdBN.gt(0)) {
        const asset0 = await assetManagerContract.assets(0);
        debugString += `Asset #0 => status=${asset0.status}\n`;
      }

      const roleOnChain = await assetManagerContract.getRole(userAddress);
      debugString += `Your role => ${roleOnChain}\n`;

      setDebugInfo(debugString);
    } catch (error) {
      setDebugInfo("Error: " + error.message);
      console.error("Debug check error:", error);
    }
  };

  if (loadingAssets) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh" // or whatever full page
        }}
      >
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>
          Loading assets from chain…
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* AppBar with the user icon on the right */}
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Building Asset Management 🏢
          </Typography>

          {/* The user icon / wallet connector menu */}
          <WalletConnector
            onWalletConnected={setUserAddress}
            setUserRole={setUserRole}
            role={userRole}
            refreshAssets={loadAssets}
          />
        </Toolbar>
      </AppBar>

      {/* Main container for the IFC viewer and everything else */}
      <Container sx={{ mt: 4 }}>
        {/* The IFC viewer */}
        <IFCViewer 
          onObjectSelected={handleObjectSelected} 
          userRole={userRole} 
          focusGlobalId={focusGlobalId}
          />

        {/* If user clicked an IFC object, show floating panel */}
        {selectedGlobalId && (
          <FloatingAssetPanel
            globalId={selectedGlobalId}
            asset={selectedAsset}
            userRole={userRole}
            refreshAssets={loadAssets}
            onObjectSelected={handleObjectSelected}
            panelX={panelPos.x}
            panelY={panelPos.y}
          />
        )}

        {/* If user is Admin => AdminActions */}
        {userRole === "Admin" && (
          <AdminActions
            role={userRole}
            refreshAssets={loadAssets}
          />
        )}



        {/* If user is Technician => TechnicianActions */}
        {userRole === "Technician" && (
          <TechnicianActions role={userRole} account={userAddress} />
        )}

        {/* Display the asset list */}
        {(userRole === "Technician" || userRole === "Admin") && (
          <AssetList
            assets={assets}
            onRefresh={loadAssets}
            userAddress={userAddress}
            userRole={userRole}
            onLocate={setFocusGlobalId}
          />
        )}

        {userRole === "Admin" && (
          <Button variant="outlined" onClick={debugCheckContract}>
            Debug Check Contract
          </Button>
        )}
        <pre>{debugInfo}</pre>
      </Container>
    </Box>
  );
}

export default App;