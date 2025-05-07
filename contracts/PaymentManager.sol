// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * PaymentManager: Holds ETH (or test ETH on Sepolia)
 * and releases funds to technicians.
 * Admin can deposit/withdraw.
 * The AssetManager contract can request a pay-out
 * if maintenance is confirmed.
 */

contract PaymentManager {
    address public owner; // Admin or dApp owner
    address public assetManager; // The AssetManager contract address

    // Simple constructor
    constructor() {
        owner = msg.sender;
    }

    // Restrict certain functions to only the contract owner
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // Restrict certain functions to only the AssetManager
    modifier onlyAssetManager() {
        require(msg.sender == assetManager, "Not AssetManager");
        _;
    }

    /**
     * @dev Link the AssetManager contract after deployment.
     *      Should be called by the owner one time only.
     */
    function setAssetManager(address _assetManager) external onlyOwner {
        assetManager = _assetManager;
    }

    /**
     * @dev Admin can deposit ETH into this contract
     *      by simply sending a transaction with value
     *      or calling deposit() with `msg.value`.
     */
    function deposit() external payable onlyOwner {
        // no special logic, just accepting ETH
    }

    /**
     * @dev Admin can withdraw some ETH from this contract.
     */
    function withdrawPartial(uint amountInWei) external onlyOwner { //non usata
        require(amountInWei > 0, "Cannot withdraw zero");
        require(amountInWei <= address(this).balance, "Not enough balance");
        payable(owner).transfer(amountInWei);
    }

    /**
     * @dev Pay out a technician.
     *      Can only be called by the AssetManager contract
     *      once the Admin confirms maintenance, etc.
     * @param technician The technician's address
     * @param amountInWei The amount in wei to pay
     */
    function payTechnician(
        address technician,
        uint amountInWei
    ) external onlyAssetManager {
        require(
            address(this).balance >= amountInWei,
            "Not enough funds in PaymentManager"
        );
        payable(technician).transfer(amountInWei);
        // (optional) emit an event
        // emit TechnicianPaid(technician, amountInWei);
    }

    // In PaymentManager.sol
    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    function reimburseUser(
        address user,
        uint256 amountInWei
    ) external onlyAssetManager {
        require(
            address(this).balance >= amountInWei,
            "Not enough funds for reimbursement"
        );
        payable(user).transfer(amountInWei);
        // emit GasReimbursed(user, amountInWei); // optionally emit an event
    }

    // Fallback: accept ETH
    receive() external payable {}
    fallback() external payable {}
}
