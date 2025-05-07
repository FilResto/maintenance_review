import React, { useState, useEffect } from "react";
import {
  Paper,
  Button,
  Typography,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import { ethers } from "ethers";
import {
  ASSET_MANAGER_ADDRESS,
  ASSET_MANAGER_ABI,
  PAYMENT_MANAGER_ADDRESS,
  PAYMENT_MANAGER_ABI
} from "../config";

function FloatingAssetPanel({
  globalId,
  asset,
  userRole,
  refreshAssets,
  panelX,
  panelY
}) {
  const [faultDesc, setFaultDesc] = useState("");
  const [maintenanceHistory, setMaintenanceHistory] = useState([]);
  const [startComment, setStartComment] = useState("");
  const [endComment, setEndComment] = useState("");
  const [newPhysicalId, setNewPhysicalId] = useState("");

  // We'll hide the third accordion by default (history),
  // but you can easily make it controlled if you like.
  const [expandedHistory, setExpandedHistory] = useState(false);

  const [cancelReason, setCancelReason] = useState("");
  /* 👉 NEW: false-report ban status */
  const [isBanned, setIsBanned] = useState(false);
  const [banChecked, setBanChecked] = useState(false);

  /* ───── check ban status whenever address changes ───── */
  useEffect(() => {
    (async () => {
      if (userRole !== "User") {
        setIsBanned(false);
        setBanChecked(true);
        return;
        }              // only Users are checked
      try {
        // create fresh signer/contract just for this check
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const contract = new ethers.Contract(
          ASSET_MANAGER_ADDRESS,
          ASSET_MANAGER_ABI,
          signer
        );
        const addr = await signer.getAddress();
        const count = await contract.counterMiss(addr);
        setIsBanned(count.toNumber() >= 3);
      } catch (err) {
        console.error("counterMiss fetch failed:", err);
        setIsBanned(false);                         // fail-open (UI only)
      }finally {
        setBanChecked(true);
      }
    })();
  }, [userRole]);


  if (!globalId) return null; // If no GlobalId, don't render
  if (asset === undefined) {
    return null;
    // Or:
    // return (
    //   <Paper style={{ position: 'absolute', left: panelX + 10, ... }}>
    //     <Typography>Loading…</Typography>
    //   </Paper>
    // );
  }

  if (!asset) {
    // No on-chain asset found
    return (
      <Paper
        style={{
          position: "absolute",
          left: panelX + 10,
          top: panelY + 10,
          width: 320,
          padding: "1rem",
          zIndex: 999,
          background: "#fff"
        }}
      >
        <Typography variant="h6">GlobalId: {globalId}</Typography>
        <Typography color="error">No linked asset found on-chain.</Typography>
      </Paper>
    );
  }

  // Prepare contract
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  const assetManagerContract = new ethers.Contract(
    ASSET_MANAGER_ADDRESS,
    ASSET_MANAGER_ABI,
    signer
  );



  // Color-code the status text
  let statusColor = "";
  if (asset.status === "Operational") statusColor = "green";
  else if (asset.status === "Broken") statusColor = "red";
  else if (asset.status === "Under Maintenance") statusColor = "orange";

  // Helper for date
  const formatTimestamp = (ts) => new Date(ts * 1000).toLocaleString();

  // 1) For user to report a fault
  const handleReportFault = async () => {
    if (!faultDesc) {
      alert("Please enter a fault description first.");
      return;
    }
    try {
      const tx = await assetManagerContract.reportFault(asset.id, faultDesc);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed;
      const gasPrice = receipt.effectiveGasPrice;
      const actualCostWei = gasUsed.mul(gasPrice);

      const gasCostInEth = ethers.utils.formatEther(actualCostWei);
      // 1) Get user’s wallet address from the signer
      const userAddr = await signer.getAddress();


      // ---------- NEW: store off-chain in your backend as well ----------
      // (2) store in the DB
      await fetch("http://localhost:4000/gasCosts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: asset.id,
          user: userAddr,
          costWei: actualCostWei.toString()
        })
      });
      // ------------------------------------------------------------------

      alert(`Fault reported! Gas cost: ${ethers.utils.formatEther(actualCostWei)} POL`);
      setFaultDesc("");
      refreshAssets();
    } catch (error) {
      // Always log the full error to see if it has a .data field or nested error object.
      console.error("Error handleReportFault:", error);

      // Basic fallback message (the same one you do now).
      let messageToShow = error.message;

      // If we can see a low-level revert in error.error.data, try parsing it using the ABI.
      if (error?.error?.data) {
        try {
          // Build an Interface from your contract’s ABI. Make sure to import ethers.utils if needed:
          //   import { ethers } from "ethers";
          //   const iface = new ethers.utils.Interface(ASSET_MANAGER_ABI);
          //
          // We already have it above, so:
          const iface = new ethers.utils.Interface(ASSET_MANAGER_ABI);
          const parsedError = iface.parseError(error.error.data);

          // parsedError.name might be "Error" (for standard revert) or a custom error name.
          // parsedError.args might have the revert reason string or custom error fields.
          if (parsedError?.args?.length) {
            // For a typical require(msg, "reason") revert, you'll see parsedError.args[0] as the reason
            messageToShow = `Reverted with: ${parsedError.args.join(", ")}`;
          } else {
            // If no args, at least show the custom error name
            messageToShow = `Reverted with custom error: ${parsedError.name}`;
          }
        } catch (parseErr) {
          console.warn("Could not parse revert reason from error data:", parseErr);
          // If parsing fails, we still show the fallback message
        }
      }

      // Display the final message
      alert(messageToShow);
    }
  };


  const handleCancelFault = async () => {
    try {
      // 1) Call cancelFault(...) on-chain
      const tx = await assetManagerContract.cancelFault(asset.id, cancelReason);
      const receipt = await tx.wait();

      // 2) If that succeeds, remove the local DB record for gas costs:
      //    We first need to know who reported the fault + costWei from the DB
      //    That info is stored in the gas_costs table keyed by (assetId).
      //    So let's fetch it:
      const res = await fetch(`http://localhost:4000/gasCosts`);
      const data = await res.json(); // an array of {assetId, user, costWei}

      // find matching row
      const row = data.find((r) => parseInt(r.assetId) === asset.id);
      if (row) {
        // 3) DELETE that row
        const delUrl = `http://localhost:4000/gasCosts?assetId=${row.assetId}&user=${row.user}&costWei=${row.costWei}`;
        await fetch(delUrl, { method: "DELETE" });
      }

      // 4) Refresh assets so UI sees the new status
      alert(`Fault canceled for asset #${asset.id}`);
      setCancelReason("");
      refreshAssets();
    } catch (err) {
      console.error("Error canceling fault:", err);
      alert(err.message);
    }
  };


  // 2) Technician starts maintenance
  const handleStartMaintenance = async () => {
    try {
      const tx = await assetManagerContract.startMaintenance(asset.id, startComment, {
        gasLimit: 300000
      });
      await tx.wait();
      alert("Maintenance started!");
      refreshAssets();
    } catch (error) {
      // Always log the full error to see if it has a .data field or nested error object.
      console.error("Error handleStartMaintenance:", error);

      // Basic fallback message (the same one you do now).
      let messageToShow = error.message;

      // If we can see a low-level revert in error.error.data, try parsing it using the ABI.
      if (error?.error?.data) {
        try {
          // Build an Interface from your contract’s ABI. Make sure to import ethers.utils if needed:
          //   import { ethers } from "ethers";
          //   const iface = new ethers.utils.Interface(ASSET_MANAGER_ABI);
          //
          // We already have it above, so:
          const iface = new ethers.utils.Interface(ASSET_MANAGER_ABI);
          const parsedError = iface.parseError(error.error.data);

          // parsedError.name might be "Error" (for standard revert) or a custom error name.
          // parsedError.args might have the revert reason string or custom error fields.
          if (parsedError?.args?.length) {
            // For a typical require(msg, "reason") revert, you'll see parsedError.args[0] as the reason
            messageToShow = `Reverted with: ${parsedError.args.join(", ")}`;
          } else {
            // If no args, at least show the custom error name
            messageToShow = `Reverted with custom error: ${parsedError.name}`;
          }
        } catch (parseErr) {
          console.warn("Could not parse revert reason from error data:", parseErr);
          // If parsing fails, we still show the fallback message
        }
      }

      // Display the final message
      alert(messageToShow);
    }
  };

  // 3) Technician completes maintenance
  const handleCompleteMaintenance = async () => {
    try {
      const tx = await assetManagerContract.completeMaintenance(asset.id, endComment);
      await tx.wait();
      alert("Maintenance completed!");
      refreshAssets();
    } catch (error) {
      // Always log the full error to see if it has a .data field or nested error object.
      console.error("Error handleCompleteMaintenance:", error);

      // Basic fallback message (the same one you do now).
      let messageToShow = error.message;

      // If we can see a low-level revert in error.error.data, try parsing it using the ABI.
      if (error?.error?.data) {
        try {
          // Build an Interface from your contract’s ABI. Make sure to import ethers.utils if needed:
          //   import { ethers } from "ethers";
          //   const iface = new ethers.utils.Interface(ASSET_MANAGER_ABI);
          //
          // We already have it above, so:
          const iface = new ethers.utils.Interface(ASSET_MANAGER_ABI);
          const parsedError = iface.parseError(error.error.data);

          // parsedError.name might be "Error" (for standard revert) or a custom error name.
          // parsedError.args might have the revert reason string or custom error fields.
          if (parsedError?.args?.length) {
            // For a typical require(msg, "reason") revert, you'll see parsedError.args[0] as the reason
            messageToShow = `Reverted with: ${parsedError.args.join(", ")}`;
          } else {
            // If no args, at least show the custom error name
            messageToShow = `Reverted with custom error: ${parsedError.name}`;
          }
        } catch (parseErr) {
          console.warn("Could not parse revert reason from error data:", parseErr);
          // If parsing fails, we still show the fallback message
        }
      }

      // Display the final message
      alert(messageToShow);
    }
  };

  // 4) Technician optionally replaces the physical item
  const handleReplaceItem = async () => {
    if (!newPhysicalId) {
      alert("Please enter a new physical ID.");
      return;
    }
    try {
      const tx = await assetManagerContract.replacePhysicalItem(
        asset.id,
        newPhysicalId
      );
      await tx.wait();
      alert("Physical item replaced!");
      setNewPhysicalId("");
      refreshAssets();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  // 5) Expand/collapse the Maintenance History accordion
  const handleHistoryAccordionChange = async (event, isExpanded) => {
    setExpandedHistory(isExpanded);
    if (isExpanded && maintenanceHistory.length === 0) {
      // fetch from chain once we expand (only if not already fetched)
      try {
        const history = await assetManagerContract.getMaintenanceHistory(asset.id);
        const records = history.map((h) => ({
          technician: h.technician,
          startTime: h.startTime.toNumber(),
          endTime: h.endTime.toNumber(),
          oldPhysicalId: h.oldPhysicalId,
          newPhysicalId: h.newPhysicalId,
          technicianComment: h.technicianComment
        }));
        setMaintenanceHistory(records);
      } catch (err) {
        console.error("Error fetching maintenance history:", err);
        alert(err.message);
      }
    }
  };

  return (
    <Paper
      style={{
        position: "absolute",
        left: panelX + 10,
        top: panelY + 10,
        width: 320,
        padding: "0.5rem",
        zIndex: 999,
        background: "#fff"
      }}
    >
      {/* ------------- ACCORDION #1 => ASSET INFO ------------- */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1">
            Asset Info
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <List dense>
            {/* Basic fields everyone can see */}
            <ListItem>
              <ListItemText
                primary="Asset ID"
                secondary={asset.id}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Category"
                secondary={asset.category}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Status"
                secondary={
                  <span style={{ color: statusColor }}>
                    {asset.status}
                  </span>
                }
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Floor"
                secondary={asset.floor}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Room"
                secondary={asset.room}
              />
            </ListItem>

            {/* Admin/Tech see these extra fields */}
            {(userRole === "Admin" || userRole === "Technician") && (
              <>
                <ListItem>
                  <ListItemText
                    primary="GlobalId"
                    secondary={globalId}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="PositionId"
                    secondary={asset.positionId}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="PhysicalId"
                    secondary={asset.physicalId}
                  />
                </ListItem>
              </>
            )}
          </List>
        </AccordionDetails>
      </Accordion>

      {/* ------------- ACCORDION #2 => ACTIONS ------------- */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1">
            Actions
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          {/* If user=User & status=Operational ➜ "Report Fault" */}
          {userRole === "User" && asset.status === "Operational" && banChecked && !isBanned && (
            <div style={{ marginBottom: "1rem" }}>
              <TextField
                label="Fault Description"
                variant="outlined"
                size="small"
                value={faultDesc}
                onChange={(e) => setFaultDesc(e.target.value)}
                placeholder="Lamp flickering"
                fullWidth
                style={{ marginBottom: "0.5rem" }}
              />
              <Button
                onClick={handleReportFault}
                variant="contained"
                color="error"
                fullWidth
              >
                Report Fault
              </Button>
            </div>
          )}
          {/* USER  ➜  Banned notice */}
          {userRole === "User" && isBanned && isBanned && (
            <Typography color="error" sx={{ mb: 2 }}>
              You have been permanently banned from reporting faults
              (3 false reports).
            </Typography>
          )}
          {/* Admin ➜ if Broken ➜ Cancel Fault with 0 reimbursement */}
          {userRole === "Admin" && asset.status === "Broken" && (
            <div style={{ marginBottom: "1rem" }}>
              <TextField
                label="Cancel Reason"
                variant="outlined"
                size="small"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Mistake / false alarm"
                fullWidth
                style={{ marginBottom: "0.5rem" }}
              />
              <Button
                onClick={handleCancelFault}
                variant="contained"
                color="secondary"
                fullWidth
              >
                Cancel Fault (0 reimbursement)
              </Button>
            </div>
          )}

          {/* Technician => start maintenance if Broken */}
          {userRole === "Technician" && asset.status === "Broken" && (
            <div style={{ marginBottom: "1rem" }}>
              <TextField
                label="Start Comment"
                variant="outlined"
                size="small"
                value={startComment}
                onChange={(e) => setStartComment(e.target.value)}
                placeholder="Investigating the broken item..."
                fullWidth
                style={{ marginBottom: "0.5rem" }}
              />
              <Button
                onClick={handleStartMaintenance}
                variant="contained"
                color="warning"
                fullWidth
              >
                Start Maintenance
              </Button>
            </div>
          )}

          {/* Technician => if Under Maintenance => Replace / Complete */}
          {userRole === "Technician" && asset.status === "Under Maintenance" && (
            <>
              <Typography variant="body2" sx={{ mb: 1 }}>
                (Optional) If irreparable, set new PhysicalId:
              </Typography>
              <TextField
                label="New Physical ID"
                variant="outlined"
                size="small"
                value={newPhysicalId}
                onChange={(e) => setNewPhysicalId(e.target.value)}
                placeholder="LampSerial1234"
                fullWidth
                style={{ marginBottom: "0.5rem" }}
              />
              <Button
                onClick={handleReplaceItem}
                variant="contained"
                color="secondary"
                fullWidth
                sx={{ mb: 2 }}
              >
                Replace Item
              </Button>

              <TextField
                label="End Comment"
                variant="outlined"
                size="small"
                value={endComment}
                onChange={(e) => setEndComment(e.target.value)}
                placeholder="Lamp replaced & tested"
                fullWidth
                style={{ marginBottom: "0.5rem" }}
              />
              <Button
                onClick={handleCompleteMaintenance}
                variant="contained"
                color="success"
                fullWidth
              >
                Complete Maintenance
              </Button>
            </>
          )}

          {/* If none of the above actions apply, show a small message */}
          {/* e.g. If user=User but asset is broken => no direct action, etc. */}
          {!(userRole === "User" && asset.status === "Operational") &&
            !(userRole === "Technician" && asset.status === "Broken") &&
            !(userRole === "Technician" && asset.status === "Under Maintenance") && (
              <Typography variant="body2" color="textSecondary">
                No specific actions available for this asset status.
              </Typography>
            )}
        </AccordionDetails>
      </Accordion>

      {/* ------------- ACCORDION #3 => MAINTENANCE HISTORY (Only Admin/Tech) ------------- */}
      {(userRole === "Admin" || userRole === "Technician") && (
        <Accordion expanded={expandedHistory} onChange={handleHistoryAccordionChange}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">
              Maintenance History
            </Typography>
          </AccordionSummary>
          <AccordionDetails style={{ maxHeight: "300px", overflowY: "auto" }}>
            {maintenanceHistory.length === 0 ? (
              <Typography variant="body2">
                No maintenance history for asset #{asset.id}
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Technician</TableCell>
                    <TableCell>Start Time</TableCell>
                    <TableCell>End Time</TableCell>
                    <TableCell>Old / New ID</TableCell>
                    <TableCell>Comment</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {maintenanceHistory.map((rec, idx) => {
                    const replaced =
                      rec.newPhysicalId &&
                      rec.newPhysicalId !== rec.oldPhysicalId;
                    return (
                      <TableRow key={idx}>
                        <TableCell>{shortenAddress(rec.technician)}</TableCell>
                        <TableCell>
                          {rec.startTime
                            ? formatTimestamp(rec.startTime)
                            : "N/A"}
                        </TableCell>
                        <TableCell>
                          {rec.endTime === 0
                            ? "Ongoing"
                            : formatTimestamp(rec.endTime)}
                        </TableCell>
                        <TableCell>
                          {replaced ? (
                            <>
                              <strong>Old:</strong> {rec.oldPhysicalId}
                              <br />
                              <strong>New:</strong> {rec.newPhysicalId}
                            </>
                          ) : (
                            rec.oldPhysicalId
                          )}
                        </TableCell>
                        <TableCell>
                          {rec.technicianComment || "--"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </AccordionDetails>
        </Accordion>
      )}
    </Paper>
  );
}

export default FloatingAssetPanel;

// Utility function
function shortenAddress(address) {
  if (!address) return "";
  return address.slice(0, 6) + "…" + address.slice(-4);
}
