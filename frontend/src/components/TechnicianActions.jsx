// Technician interactions (Start/Complete Maintenance)


import React, { useState, useEffect } from "react";
import {Typography} from "@mui/material";
import { ethers } from "ethers";
import { ASSET_MANAGER_ADDRESS, ASSET_MANAGER_ABI, PAYMENT_MANAGER_ADDRESS, PAYMENT_MANAGER_ABI } from "../config";


const TechnicianActions = ({ assetId, role, account }) => {

  const [myJobs, setMyJobs] = useState([]);

  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  const assetManagerContract = new ethers.Contract(ASSET_MANAGER_ADDRESS, ASSET_MANAGER_ABI, signer);
  const paymentManagerContract = new ethers.Contract(PAYMENT_MANAGER_ADDRESS, PAYMENT_MANAGER_ABI, signer);

  useEffect(() => {
    loadMyJobs();
  }, []);

const loadMyJobs = async () => {
  try {
    // Step 1) Get list of asset IDs for which "tech = account" has at least one record:
    const assetIds = await assetManagerContract.getTechnicianCompletedAssets(account);
    const expanded = [];

    // Step 2) For each asset, fetch the entire array of completed maintenance
    for (let id of assetIds) {
      // This returns an array of CompletedMaintenance records
      const cmArray = await assetManagerContract.getAllCompletedMaintenance(id);

      // Step 3) If you only want the ones that belong to this technician (to be safe):
      for (let cm of cmArray) {
        if (cm.technician.toLowerCase() === account.toLowerCase()) {
          expanded.push({
            assetId: id.toString(),
            readyForPayment: cm.readyForPayment,
            isPaid: cm.isPaid,
            paymentTimestamp: cm.paymentTimestamp.toNumber(),
            paidAmountWei: cm.paidAmountWei.toString(),
          });
        }
      }
    }

    setMyJobs(expanded);
  } catch (error) {
    console.error("Error loading technician jobs:", error);
  }
};



  if (role !== "Technician") return null; // Hide if not a Technician
  
  return (
    <div style={{ marginTop: "1rem" }}>
      <Typography variant="h5">My Completed Jobs</Typography>
      {myJobs.length === 0 && <p>No completed maintenance yet.</p>}
      {myJobs.map((job) => (
        <div
          key={job.assetId}
          style={{ padding: "0.5rem", borderBottom: "1px solid #ccc" }}
        >
          <p>Asset #{job.assetId}</p>
          {job.isPaid ? (
            <p>Paid {ethers.utils.formatEther(job.paidAmountWei)} on {new Date(job.paymentTimestamp * 1000).toLocaleString()}</p>
            
          ) : job.readyForPayment ? (
            <p>Payment pending…</p>
          ) : (
            <p>Not ready for payment yet (or no payment expected)</p>
          )}
        </div>
      ))}
    </div>
  );
};

export default TechnicianActions;
