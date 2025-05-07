// User interactions (Register, Request Technician, Report Faults)
import React, { useState, useEffect } from "react";
import { Button } from "@mui/material";
import { ethers } from "ethers";
import { ASSET_MANAGER_ADDRESS, ASSET_MANAGER_ABI, PAYMENT_MANAGER_ADDRESS, PAYMENT_MANAGER_ABI } from "../config";  // import them

const UserActions = ({ account, role, fetchRole }) => {
  const [hasRequested, setHasRequested] = useState(false);

  useEffect(() => {
    if (account && role === "User") {
      checkTechnicianRequest();
    }
  }, [account, role]); // Runs when account or role changes

  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  const assetManagerContract  = new ethers.Contract(ASSET_MANAGER_ADDRESS, ASSET_MANAGER_ABI, signer);
  const paymentManagerContract = new ethers.Contract(PAYMENT_MANAGER_ADDRESS, PAYMENT_MANAGER_ABI, signer);

  const checkTechnicianRequest = async () => {
    try {
      const requested = await assetManagerContract.hasRequestedTechnician(account);
      setHasRequested(requested);
    } catch (error) {
      console.error("Error checking technician request:", error);
    }
  };
  

  const registerUser = async () => {
    try {
      console.log(role)
      const tx = await assetManagerContract.requestUserRegistration({ gasLimit: 300000 });
      await tx.wait();
      alert("Send user registration request!");
      await fetchRole(account);
    } catch (error) {
      console.error("Error registering user:", error);
      alert("Error: " + error.message);
    }
  };

  const requestTechnician = async () => {
    try {
      console.log(`Current role before requesting: ${role}`);
      if (role !== "User") {
        alert("You must be a registered User to request a Technician role.");
        return;
      }

      if (hasRequested) {
        alert("You have already requested the Technician role. Please wait for approval.");
        return;
      }

      const tx = await assetManagerContract.requestTechnicianRole({ gasLimit: 300000 });
      await tx.wait();
      
      alert("Technician role requested!");
      setHasRequested(true); // Update state to hide button
      await fetchRole(account);
    } catch (error) {
      console.error("Error requesting technician:", error);
      alert("Error: " + error.message);
    }
  };

  return (
    <div>
      {/* Show Register button ONLY if account is connected & role is Unregistered */}
      {role === "Unregistered" && (
        <Button variant="contained" color="primary" onClick={registerUser}>
          Register as User
        </Button>
      )}

      {/* Show Request Technician Role button ONLY if role is User & has not already requested */}
      {role === "User" && !hasRequested && (
        <Button variant="contained" color="secondary" onClick={requestTechnician}>
          Request Technician Role
        </Button>
      )}

      {/* Show "Requested" Message If Already Applied */}
      {role === "User" && hasRequested && (
        <p>You have already requested the Technician role. Waiting for admin approval.</p>
      )}
    </div>
  );
};

export default UserActions;
