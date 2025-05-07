// AssetList.jsx
import React, { useState } from "react";
import { ethers } from "ethers";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  TextField,
  Typography,
  Chip,
  Stack
} from "@mui/material";
import {
  ASSET_MANAGER_ADDRESS,
  ASSET_MANAGER_ABI,
  PAYMENT_MANAGER_ADDRESS,
  PAYMENT_MANAGER_ABI
} from "../config";

function AssetList({ assets, onRefresh, userAddress, userRole, onLocate }) {
  // Local states for fault reporting
  const [reportingAssetId, setReportingAssetId] = useState(null);
  const [faultComment, setFaultComment] = useState("");

  // Maintenance history
  const [historyAssetId, setHistoryAssetId] = useState(null);
  const [maintenanceHistory, setMaintenanceHistory] = useState([]);

  // Contract references
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

  // Called when user clicks "Report Fault"
  const startReportingFault = (assetId) => {
    setReportingAssetId(assetId);
    setFaultComment("");
  };

  // Confirm the fault
  const confirmReportFault = async (id) => {
    if (!faultComment) {
      alert("Please enter a fault description first.");
      return;
    }
    try {
      const tx = await assetManagerContract.reportFault(id, faultComment);
      await tx.wait();
      alert("Fault reported successfully!");
      setReportingAssetId(null);
      setFaultComment("");
      onRefresh(); // <-- re-fetch from the parent
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  const cancelReporting = () => {
    setReportingAssetId(null);
    setFaultComment("");
  };

  // Technician flows
  const startMaintenance = async (id) => {
    try {
      const tx = await assetManagerContract.startMaintenance(id);
      await tx.wait();
      alert("Maintenance started!");
      onRefresh(); // re-fetch from parent
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  const completeMaintenance = async (id) => {
    try {
      const tx = await assetManagerContract.completeMaintenance(id);
      await tx.wait();
      alert("Maintenance completed!");
      onRefresh();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  // Show maintenance history
  const viewHistory = async (assetId) => {
    if (historyAssetId === assetId) {
      // toggling off
      setHistoryAssetId(null);
      setMaintenanceHistory([]);
      return;
    }
    try {
      const history = await assetManagerContract.getMaintenanceHistory(assetId);
      // each record: { technician, startTime, endTime }
      const records = history.map((h) => ({
        technician: h.technician,
        startTime: h.startTime.toNumber(),
        endTime: h.endTime.toNumber()
      }));
      setHistoryAssetId(assetId);
      setMaintenanceHistory(records);
    } catch (err) {
      console.error("Error fetching maintenance history:", err);
      alert(err.message);
    }
  };

  // Format Unix timestamp
  const formatTimestamp = (ts) => new Date(ts * 1000).toLocaleString();

  // Utility to color-code statuses
  const getStatusChip = (status) => {
    let color = "default";
    if (status === "Operational") color = "success";
    else if (status === "Broken") color = "error";
    else if (status === "Under Maintenance") color = "warning";

    return <Chip label={status} color={color} size="small" />;
  };


  return (
    <div style={{ marginTop: "1rem" }}>
      <Typography variant="h5" gutterBottom>
        All Assets
      </Typography>
      <Paper sx={{ p: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead sx={{ backgroundColor: "grey.100" }}>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Building</TableCell>
                <TableCell>Floor</TableCell>
                <TableCell>Room</TableCell>
                <TableCell>Brand</TableCell>
                <TableCell>Model</TableCell>
                <TableCell>Photo</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>FaultType</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {assets.map((asset) => {
                const isReportingNow = reportingAssetId === asset.id;

                return (
                  <React.Fragment key={asset.id}>
                    {/* Main row */}
                    <TableRow hover>
                      <TableCell>{asset.id}</TableCell>
                      <TableCell>{asset.category}</TableCell>
                      <TableCell>{asset.building}</TableCell>
                      <TableCell>{asset.floor}</TableCell>
                      <TableCell>{asset.room}</TableCell>
                      <TableCell>{asset.brand}</TableCell>
                      <TableCell>{asset.model}</TableCell>
                      <TableCell>
                        {asset.ipfsHash ? (
                          <img
                            src={`https://gateway.pinata.cloud/ipfs/${asset.ipfsHash}`}
                            alt="Asset"
                            style={{ width: 75, height: "auto" }}
                          />
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            No Image
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{getStatusChip(asset.status)}</TableCell>
                      <TableCell>{asset.faultType || "–"}</TableCell>
                      {/* 4) Locate in 3-D */}
                      {["Technician", "Admin"].includes(userRole) && asset.globalId && (
                        <Button
                          variant="outlined"
                          size="small"
                          sx={{ mt: 1 }}
                          onClick={() => {
                            console.log("Locate clicked – globalId:", asset.globalId);
                            onLocate?.(asset.globalId);
                          }}
                        >
                          Locate
                        </Button>
                      )}
                    </TableRow>
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </div>
  );
}

export default AssetList;