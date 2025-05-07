// WalletConnector.jsx
import React, { useState, useEffect } from "react";
import {
  IconButton,
  Menu,
  MenuItem,
  Typography,
  Box
} from "@mui/material";
import AccountCircle from "@mui/icons-material/AccountCircle";
import { ethers } from "ethers";

import {
  ASSET_MANAGER_ADDRESS,
  ASSET_MANAGER_ABI
} from "../config";

const WalletConnector = ({ onWalletConnected, setUserRole, role, refreshAssets }) => {
  const [account, setAccount] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);

  // Track if this user has requested the technician role
  const [hasRequestedTech, setHasRequestedTech] = useState(false);
  const [hasRequestedUser, setHasRequestedUser] = useState(false);

  useEffect(() => {
    // If account is unregistered, check if they've requested user registration
    if (account && role === "Unregistered") {
      checkUserRequest();
    }
  }, [account, role]);
  useEffect(() => {
    // If user was connected previously, re-check
    const storedAccount = localStorage.getItem("connectedAccount");
    if (storedAccount) {
      checkWalletConnection();
    }
  }, []);

  // After we know the user is connected and is "User," check if they requested Tech
  useEffect(() => {
    if (account && role === "User") {
      checkTechnicianRequest();
    }
  }, [account, role]);

  const checkWalletConnection = async () => {
    if (window.ethereum) {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const accounts = await provider.listAccounts();
      if (accounts.length > 0) {
        const userAddr = accounts[0];
        setAccount(userAddr);
        onWalletConnected(userAddr);

        // fetch on-chain role
        const userRoleOnChain = await fetchRoleFromChain(userAddr);
        setUserRole(userRoleOnChain);
      }
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("MetaMask is not installed!");
      return;
    }
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send("wallet_requestPermissions", [{ eth_accounts: {} }]);
      const accounts = await provider.listAccounts();

      if (accounts.length > 0) {
        const userAddr = accounts[0];
        setAccount(userAddr);
        localStorage.setItem("connectedAccount", userAddr);
        onWalletConnected(userAddr);

        const userRoleOnChain = await fetchRoleFromChain(userAddr);
        setUserRole(userRoleOnChain);

        if (refreshAssets) {
          refreshAssets();
        }

        handleMenuClose(); // close the menu after connecting
      }
    } catch (error) {
      console.error("Error connecting wallet:", error);
      alert("Error: " + error.message);
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setUserRole(null);
    localStorage.removeItem("connectedAccount");
    handleMenuClose();
  };

  // ---------- THE NEW PART: MIGRATING from UserActions.js ---------- //

  // 1) We need a contract reference for registration calls
  // (We can define them inside functions or once here.)
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  const assetManagerContract = new ethers.Contract(
    ASSET_MANAGER_ADDRESS,
    ASSET_MANAGER_ABI,
    signer
  );
  const checkUserRequest = async () => {
    try {
      // read pendingUsers from the contract
      const requested = await assetManagerContract.pendingUsers(account);
      setHasRequestedUser(requested);
    } catch (error) {
      console.error("Error checking user request:", error);
    }
  };


  // 2) Check if user already requested technician
  const checkTechnicianRequest = async () => {
    try {
      const requested = await assetManagerContract.hasRequestedTechnician(account);
      setHasRequestedTech(requested);
    } catch (error) {
      console.error("Error checking technician request:", error);
    }
  };

  // 3) "Register as user"
  const registerUser = async () => {
    try {
      const tx = await assetManagerContract.requestUserRegistration({ gasLimit: 300000 });
      await tx.wait();
      alert("Sent user registration request!");
      // Re-fetch role to see if it changed
      const newRole = await fetchRoleFromChain(account);
      setUserRole(newRole);
      setHasRequestedUser(true); // Now you know it's requested
    } catch (error) {
      console.error("Error registering user:", error);
      alert("Error: " + error.message);
    } finally {
      handleMenuClose();
    }
  };

  // 4) Request technician
  const requestTechnician = async () => {
    try {
      if (role !== "User") {
        alert("You must be a registered User before requesting Technician role.");
        return;
      }
      if (hasRequestedTech) {
        alert("You have already requested Technician role. Please wait for approval.");
        return;
      }
      const tx = await assetManagerContract.requestTechnicianRole({ gasLimit: 300000 });
      await tx.wait();

      alert("Technician role requested!");
      setHasRequestedTech(true);
    } catch (error) {
      console.error("Error requesting technician:", error);
      alert("Error: " + error.message);
    } finally {
      handleMenuClose();
    }
  };

  // ---------- HELPER: fetchRoleFromChain ---------- //
  const fetchRoleFromChain = async (userAddress) => {
    try {
      const assetMgr = new ethers.Contract(ASSET_MANAGER_ADDRESS, ASSET_MANAGER_ABI, signer);
      const roleCode = await assetMgr.getRole(userAddress);
      switch (roleCode) {
        case 0:
          return "Unregistered";
        case 1:
          return "User";
        case 2:
          return "Technician";
        case 3:
          return "Admin";
        default:
          return "Unregistered";
      }
    } catch (error) {
      console.error("Error fetching role from chain:", error);
      return "Unregistered";
    }
  };

  // ---------- Menu open/close ---------- //
  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // ---------- Shorten address for display ---------- //
  const shortenAddress = (addr) => {
    if (!addr) return "";
    return addr.slice(0, 6) + "…" + addr.slice(-4);
  };

  return (
    <Box>
      {/* User icon always visible */}
      <IconButton size="large" color="inherit" onClick={handleMenuOpen}>
        <AccountCircle />
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        {/* If not connected => Connect button */}
        {!account && (
          <MenuItem onClick={connectWallet}>
            Connect to MetaMask
          </MenuItem>
        )}

        {/* If connected => show address, role, and additional items */}
        {account && (
          <>
            <MenuItem disabled>
              <Typography variant="body2">
                {shortenAddress(account)}
              </Typography>
            </MenuItem>
            {role && (
              <MenuItem disabled>
                <Typography variant="body2">
                  Role: {role}
                </Typography>
              </MenuItem>
            )}
            {/* 1) If Unregistered => "Register as User" */}
            {role === "Unregistered" && !hasRequestedUser && (
              <MenuItem onClick={registerUser}>
                Register as User
              </MenuItem>
            )}
            {role === "Unregistered" && hasRequestedUser && (
              <MenuItem disabled>
                Registration Pending
              </MenuItem>
            )}


            {/* 2) If User => "Request Technician" (unless already requested) */}
            {role === "User" && !hasRequestedTech && (
              <MenuItem onClick={requestTechnician}>
                Request Technician Role
              </MenuItem>
            )}
            {role === "User" && hasRequestedTech && (
              <MenuItem disabled>
                Technician Request Pending
              </MenuItem>
            )}

            <MenuItem onClick={disconnectWallet}>
              Disconnect
            </MenuItem>
          </>
        )}
      </Menu>
    </Box>
  );
};

export default WalletConnector;
