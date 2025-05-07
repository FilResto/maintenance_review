import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Stack,
  Typography,
  TextField,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { ethers } from "ethers";
import {
  ASSET_MANAGER_ADDRESS,
  ASSET_MANAGER_ABI,
  PAYMENT_MANAGER_ADDRESS,
  PAYMENT_MANAGER_ABI,
} from "../config";

// The AdminActions component
const AdminActions = ({ role, refreshAssets }) => {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);

  // Asset registration fields
  const [category, setCategory] = useState("");
  const [building, setBuilding] = useState("");
  const [floor, setFloor] = useState("");
  const [room, setRoom] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [ipfsHash, setIpfsHash] = useState("");
  const [globalId, setGlobalId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [physicalId, setPhysicalId] = useState("");

  // Toggle form for registering a new asset
  const [showRegisterForm, setShowRegisterForm] = useState(false);

  // Payment manager
  const [paymentManagerBalance, setPaymentManagerBalance] = useState("");
  const [depositAmount, setDepositAmount] = useState("");

  // Maintenance Payment states
  const [pendingPayments, setPendingPayments] = useState([]);
  const [payInput, setPayInput] = useState({});
  const [paidTasks, setPaidTasks] = useState([]);

  // Off-chain gas cost tracking
  const [dbGasMap, setDbGasMap] = useState({});

  // We only load data if user is Admin
  useEffect(() => {
    if (role === "Admin") {
      loadPendingUsers();
      loadPendingRequests();
      loadPaymentManagerBalance();
      loadPendingPayments();
      loadPaidPayments();
      loadGasCostsFromServer();
    }
  }, [role]);

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

  // ------------------- LOAD FUNCTIONS ------------------- //

  // A) Pending user registrations
  const loadPendingUsers = async () => {
    try {
      const addresses = await assetManagerContract.getPendingUsers();
      setPendingUsers(addresses);
    } catch (error) {
      console.error("Error loading pending users:", error);
    }
  };

  // B) Pending technician requests
  const loadPendingRequests = async () => {
    try {
      const addresses = await assetManagerContract.getPendingTechnicians();
      setPendingRequests(addresses);
    } catch (error) {
      console.error("Error loading pending requests:", error);
    }
  };

  // C) Payment manager balance
  const loadPaymentManagerBalance = async () => {
    try {
      // Option B: raw balance from blockchain
      const bal = await provider.getBalance(PAYMENT_MANAGER_ADDRESS);
      setPaymentManagerBalance(ethers.utils.formatEther(bal));
    } catch (err) {
      console.error("Error loading PaymentManager balance:", err);
    }
  };

  // D) Pending maintenance payments
  const loadPendingPayments = async () => {
    try {
      const total = await assetManagerContract.nextAssetId();
      const tempList = [];

      for (let assetId = 0; assetId < total; assetId++) {
        const count = await assetManagerContract.getCompletedMaintenanceCount(assetId);
        for (let index = 0; index < count; index++) {
          const cm = await assetManagerContract.getCompletedMaintenance(assetId, index);
          if (cm.readyForPayment && !cm.isPaid) {
            tempList.push({
              assetId,
              technician: cm.technician,
            });
          }
        }
      }
      setPendingPayments(tempList);
    } catch (err) {
      console.error("Error loading pending payments:", err);
    }
  };

  // E) Paid tasks
  const loadPaidPayments = async () => {
    try {
      const total = await assetManagerContract.nextAssetId();
      const tempList = [];

      for (let assetId = 0; assetId < total; assetId++) {
        const count = await assetManagerContract.getCompletedMaintenanceCount(assetId);
        for (let index = 0; index < count; index++) {
          const cm = await assetManagerContract.getCompletedMaintenance(assetId, index);

          if (cm.isPaid) {
            const paidWeiStr = cm.paidAmountWei.toString();
            const paidEthStr = ethers.utils.formatEther(paidWeiStr);

            const userAddr = cm.userReimbursed;
            const userWeiStr = cm.userReimbursedAmountWei.toString();
            const userEthStr = ethers.utils.formatEther(userWeiStr);

            tempList.push({
              assetId,
              technician: cm.technician,
              paymentTimestamp: cm.paymentTimestamp.toNumber(),
              paidAmountWei: paidWeiStr,
              amountEth: paidEthStr,
              userReimbursed: userAddr,
              userReimbursedEth: userEthStr,
            });
          }
        }
      }
      setPaidTasks(tempList);
    } catch (err) {
      console.error("Error loading paid tasks:", err);
    }
  };

  // F) Off-chain gas cost DB
  const loadGasCostsFromServer = async () => {
    try {
      const res = await fetch("http://localhost:4000/gasCosts");
      const rows = await res.json();
      const map = {};
      for (const row of rows) {
        map[row.assetId] = {
          user: row.user,
          costWei: row.costWei,
          polUsd: row.polUsd
        };
      }
      setDbGasMap(map);
    } catch (err) {
      console.error("Failed to load gas costs:", err);
    }
  };

  // ------------------- USER & TECHNICIAN APPROVAL ------------------- //

  // Approve / deny user
  const approveUser = async (userAddress) => {
    try {
      const tx = await assetManagerContract.approveUser(userAddress);
      await tx.wait();
      alert(`Approved ${userAddress} as User and sent 0.01 POL for gas.`);
      loadPendingUsers();
    } catch (error) {
      console.error("Error approving user:", error);
      alert(error.message);
    }
  };
  const denyUser = async (userAddress) => {
    try {
      const tx = await assetManagerContract.denyUser(userAddress);
      await tx.wait();
      alert(`Denied registration of ${userAddress}.`);
      loadPendingUsers();
    } catch (error) {
      console.error("Error denying user:", error);
      alert(error.message);
    }
  };

  // Approve / deny technician
  const approveTechnician = async (userAddress) => {
    try {
      const tx = await assetManagerContract.approveTechnician(userAddress);
      await tx.wait();
      alert(`${userAddress} approved as Technician!`);
      loadPendingRequests();
    } catch (error) {
      console.error("Error approving technician:", error);
      alert(error.message);
    }
  };
  const denyTechnician = async (userAddress) => {
    try {
      const tx = await assetManagerContract.denyTechnician(userAddress);
      await tx.wait();
      alert(`${userAddress} was denied!`);
      loadPendingRequests();
    } catch (error) {
      console.error("Error denying technician:", error);
      alert(error.message);
    }
  };

  // ------------------- ASSET FUNCTIONS ------------------- //

  // Register a new asset
  const registerAsset = async (e) => {
    e.preventDefault();
    try {
      const floorNum = parseInt(floor);
      const roomNum = parseInt(room);
      if (isNaN(floorNum) || isNaN(roomNum)) {
        alert("Floor and Room must be numbers.");
        return;
      }
      const tx = await assetManagerContract.registerAsset(
        category,
        building,
        floorNum,
        roomNum,
        brand,
        model,
        ipfsHash,
        globalId,
        positionId,
        physicalId
      );
      await tx.wait();
      alert("Asset registered successfully!");

      if (refreshAssets) {
        await refreshAssets();
      }

      // Clear form inputs
      setCategory("");
      setBuilding("");
      setFloor("");
      setRoom("");
      setBrand("");
      setModel("");
      setIpfsHash("");
      setGlobalId("");
      setPositionId("");
      setPhysicalId("");
      setShowRegisterForm(false); // hide form
    } catch (error) {
      // Always log the full error to see if it has a .data field or nested error object.
      console.error("Error registering asset:", error);

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

  // Delete an asset
  const deleteAsset = async () => {
    const assetIdString = prompt("Enter Asset ID to delete:");
    if (assetIdString === null) return; // user canceled
    const assetId = parseInt(assetIdString);
    if (isNaN(assetId)) {
      alert("Please enter a valid numeric ID");
      return;
    }
    try {
      const tx = await assetManagerContract.deleteAsset(assetId);
      await tx.wait();
      alert(`Asset #${assetId} deleted successfully!`);
      if (refreshAssets) {
        await refreshAssets();
      }
    } catch (error) {
      console.error("Error deleting asset:", error);
      alert(error.message);
    }
  };

  // ------------------- PAYMENT MANAGER ------------------- //

  const depositToPaymentManager = async () => {
    if (!depositAmount) {
      alert("Please enter an amount to deposit");
      return;
    }
    try {
      const tx = await paymentManagerContract.deposit({
        value: ethers.utils.parseEther(depositAmount),
      });
      await tx.wait();
      alert(`Successfully deposited ${depositAmount} ETH!`);
      setDepositAmount("");
      loadPaymentManagerBalance();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  // Confirm payment of a maintenance task
  const payTechnicianFor = async (assetId) => {
    try {
      /* 0)  parse technician amount (typed by Admin) */
      const payStr = payInput[assetId];
      if (!payStr) {
        alert("Enter an amount first");
        return;
      }
      const techAmountWei = ethers.utils.parseEther(payStr);

      /* 1)  prepare defaults (no reimbursement) */
      let userAddr = ethers.constants.AddressZero;
      let userCostWei = ethers.BigNumber.from(0);

      /* 2)  if we have a row in the off-chain DB → compute reimbursement */
      const costData = dbGasMap[assetId];        // loaded earlier from GET /gasCosts
      if (costData) {
        userAddr = costData.user;

        /* snapshot data */
        const snapshotPolUsd = Number(costData.polUsd);               // USD per POL when fault was reported
        console.log("snapshotPolUsd :", snapshotPolUsd);
        const gasCostPOL = Number(ethers.utils.formatEther(costData.costWei));
        console.log("gasCostPOL :", gasCostPOL);
        const fiatSpentUsd = gasCostPOL * snapshotPolUsd;           // user’s fiat outlay at that moment
        console.log("fiatSpentUsd :", fiatSpentUsd);
        /* current POL price (from backend helper) */
        let currentPolUsd = snapshotPolUsd; 
        console.log("currentPolUsd Before api call:", currentPolUsd);                          // fallback to snapshot
        try {
          const r = await fetch("http://localhost:4000/polPrice");
          const j = await r.json();
          if (j.price) currentPolUsd = Number(j.price);
        } catch (err) {
          console.warn("Could not fetch live POL price – reimbursing original wei:", err.message);
        }
        console.log("currentPolUsd after api call:", currentPolUsd);

        /* USD → POL at today’s rate, then → wei */
        const reimbPolNow = fiatSpentUsd / currentPolUsd;             // float POL
        console.log("reimbPolNow :", reimbPolNow); 
        userCostWei = ethers.utils.parseEther(reimbPolNow.toFixed(18));
        console.log("userCostWei :", userCostWei); 
      }

      /* 3)  on-chain settlement (tech + optional user) */
      const tx = await assetManagerContract.confirmPayment(
        assetId,
        techAmountWei,
        userAddr,
        userCostWei
      );
      await tx.wait();
      alert(`Technician for asset #${assetId} paid. User reimbursed if needed.`);

      /* 4)  clear the DB row once reimbursed */
      if (costData) {
        await fetch(
          `http://localhost:4000/gasCosts?assetId=${assetId}&user=${userAddr}&costWei=${costData.costWei}`,
          { method: "DELETE" }
        );
      }

      /* 5)  refresh UI */
      loadPaymentManagerBalance();
      loadPendingPayments();
      loadPaidPayments();
      if (refreshAssets) await refreshAssets();
    } catch (error) {
      console.error("Error paying technician:", error);
      alert(error.message);
    }
  };

  // If not admin, hide everything
  if (role !== "Admin") return null;
  const formatTimestamp = (ts) => new Date(ts * 1000).toLocaleString();

  // -- RENDER --
  return (
    <Box sx={{ mt: 4 }}>
      {/* ============== ACCORDION #1: ASSET MANAGEMENT ============== */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Asset Management</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {/* Register button / form */}
          {!showRegisterForm ? (
            <Button
              variant="contained"
              color="primary"
              onClick={() => setShowRegisterForm(true)}
              sx={{ mr: 2, mb: 2 }}
            >
              Register New Asset
            </Button>
          ) : (
            <Paper sx={{ p: 3, mb: 2 }}>
              <Typography variant="subtitle1" gutterBottom>
                Register a New Asset
              </Typography>
              <form onSubmit={registerAsset}>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={2}>
                    <TextField
                      label="Category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      required
                    />
                    <TextField
                      label="Building"
                      value={building}
                      onChange={(e) => setBuilding(e.target.value)}
                      required
                    />
                    <TextField
                      label="Floor"
                      value={floor}
                      onChange={(e) => setFloor(e.target.value)}
                      required
                    />
                    <TextField
                      label="Room"
                      value={room}
                      onChange={(e) => setRoom(e.target.value)}
                      required
                    />
                  </Stack>

                  <Stack direction="row" spacing={2}>
                    <TextField
                      label="Brand"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                    />
                    <TextField
                      label="Model"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                    />
                    <TextField
                      label="IPFS Hash"
                      value={ipfsHash}
                      onChange={(e) => setIpfsHash(e.target.value)}
                    />
                    <TextField
                      label="GlobalId"
                      value={globalId}
                      onChange={(e) => setGlobalId(e.target.value)}
                      required
                    />
                  </Stack>

                  <Stack direction="row" spacing={2}>
                    <TextField
                      label="PositionId"
                      value={positionId}
                      onChange={(e) => setPositionId(e.target.value)}
                      required
                    />
                    <TextField
                      label="PhysicalId"
                      value={physicalId}
                      onChange={(e) => setPhysicalId(e.target.value)}
                      required
                    />
                  </Stack>

                  <Box>
                    <Button type="submit" variant="contained" color="primary">
                      Confirm
                    </Button>
                    <Button
                      variant="outlined"
                      color="secondary"
                      onClick={() => setShowRegisterForm(false)}
                      sx={{ ml: 2 }}
                    >
                      Cancel
                    </Button>
                  </Box>
                </Stack>
              </form>
            </Paper>
          )}
          {/* Delete asset button */}
          <Button
            variant="contained"
            color="error"
            onClick={deleteAsset}
            sx={{ mb: 2 }}
          >
            Delete an Asset
          </Button>
        </AccordionDetails>
      </Accordion>

      {/* ============== ACCORDION #2: PENDING USER REGISTRATIONS ============== */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Pending User Registrations</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {pendingUsers.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No pending user registrations.
            </Typography>
          ) : (
            pendingUsers.map((addr) => (
              <Box
                key={addr}
                sx={{ display: "flex", alignItems: "center", mb: 2 }}
              >
                <Typography sx={{ mr: 2 }}>{addr}</Typography>
                <Button
                  variant="contained"
                  color="success"
                  onClick={() => approveUser(addr)}
                  sx={{ mr: 1 }}
                >
                  Approve
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  onClick={() => denyUser(addr)}
                >
                  Deny
                </Button>
              </Box>
            ))
          )}
        </AccordionDetails>
      </Accordion>

      {/* ============== ACCORDION #3: PENDING TECHNICIAN REQUESTS ============== */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Pending Technician Requests</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {pendingRequests.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No pending requests at the moment.
            </Typography>
          ) : (
            pendingRequests.map((address) => (
              <Box
                key={address}
                sx={{ display: "flex", alignItems: "center", mb: 2 }}
              >
                <Typography sx={{ mr: 2 }}>{address}</Typography>
                <Button
                  variant="contained"
                  color="success"
                  onClick={() => approveTechnician(address)}
                  sx={{ mr: 1 }}
                >
                  Approve
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  onClick={() => denyTechnician(address)}
                >
                  Deny
                </Button>
              </Box>
            ))
          )}
        </AccordionDetails>
      </Accordion>

      {/* ============== ACCORDION #4: PAYMENT MANAGER ============== */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Payment Manager</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body1" gutterBottom>
            Contract Balance: <strong>{paymentManagerBalance} POL</strong>
          </Typography>
          <Button variant="outlined" onClick={loadPaymentManagerBalance} sx={{ mb: 2 }}>
            Refresh Balance
          </Button>
          <Stack spacing={2} direction="row">
            <TextField
              label="Deposit Amount (ETH)"
              placeholder="0.01"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
            <Button
              variant="contained"
              color="warning"
              onClick={depositToPaymentManager}
            >
              Deposit
            </Button>
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* ============== ACCORDION #5: PENDING MAINTENANCE PAYMENTS ============== */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Pending Maintenance Payments</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {pendingPayments.length === 0 ? (
            <Typography>No maintenance awaiting payment.</Typography>
          ) : (
            pendingPayments.map((pp) => {
              const costData = dbGasMap[pp.assetId];
              let userAddrToShow = "";
              let userCostEth = "0.0";

              if (costData) {
                userAddrToShow = costData.user;
                userCostEth = ethers.utils.formatEther(costData.costWei);
              }

              return (
                <Box
                  key={pp.assetId}
                  sx={{ mb: 2, borderBottom: "1px solid #ccc", pb: 2 }}
                >
                  <Typography variant="body2">
                    <strong>Asset #{pp.assetId}</strong> – Technician:{" "}
                    {pp.technician}
                  </Typography>
                  {/* Show maintenance end date/time if we have it */}
                  {pp.endTime && pp.endTime > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Ended: {formatTimestamp(pp.endTime)}
                    </Typography>
                  )}

                  {costData && (
                    <Typography variant="body2" color="text.secondary">
                      Address to Reimburse: {userAddrToShow}
                      <br />
                      Gas Cost: {userCostEth} POL
                    </Typography>
                  )}

                  <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                    <TextField
                      label="Payment (POL)"
                      placeholder="0.01"
                      value={payInput[pp.assetId] ?? ""}
                      onChange={(e) =>
                        setPayInput({
                          ...payInput,
                          [pp.assetId]: e.target.value
                        })
                      }
                      size="small"
                    />
                    <Button
                      variant="contained"
                      color="success"
                      onClick={() => payTechnicianFor(pp.assetId)}
                    >
                      Pay
                    </Button>
                  </Stack>
                </Box>
              );
            })
          )}
        </AccordionDetails>
      </Accordion>

      {/* ============== ACCORDION #6: PAID MAINTENANCE HISTORY ============== */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Paid Maintenance History</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {paidTasks.length === 0 ? (
            <Typography>No maintenance has been paid yet.</Typography>
          ) : (
            paidTasks.map((pp, idx) => (
              <Box
                key={`${pp.assetId}-${idx}`}
                sx={{ mb: 2, borderBottom: "1px solid #ccc", pb: 2 }}
              >
                <Typography variant="body2">
                  <strong>Asset #{pp.assetId}</strong> – Technician: {pp.technician}
                </Typography>
                {/* Maintenance end date/time */}
                {pp.endTime && pp.endTime > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Ended: {formatTimestamp(pp.endTime)}
                  </Typography>
                )}

                {/* Payment time & amounts */}
                <Typography variant="body2" color="text.secondary">
                  Paid on {formatTimestamp(pp.paymentTimestamp)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Amount: {pp.amountEth} POL
                </Typography>
                {/* If user was reimbursed */}
                {pp.userReimbursed !== ethers.constants.AddressZero && (
                  <Typography variant="body2" color="text.secondary">
                    User Reimbursed: {pp.userReimbursed} <br />
                    Reimbursed Amount: {pp.userReimbursedEth} POL
                  </Typography>
                )}
              </Box>
            ))
          )}
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

export default AdminActions;
