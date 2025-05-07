// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./PaymentManager.sol";

contract AssetManager {
    PaymentManager public paymentManager; // reference
    // Enum for user roles
    enum Role {
        Unregistered,
        User,
        Technician,
        Admin
    }

    // Struct to store asset details
    struct Asset {
        uint id;
        string status; // "Operational", "Broken", "Under Maintenance"
        address technician;
        uint lastMaintenanceTimestamp;
        string faultType; // NEW: Stores the fault description
        bool isDeleted; // new field to mark an asset as deleted
    }

    // Additional metadata in a separate mapping
    struct AssetMetadata {
        string category;
        string building;
        uint floor;
        uint room;
        string brand; // e.g. "Philips"
        string model; // e.g. "Model XYZ"
        string ipfsHash; // e.g. "QmXyz..." IPFS CID
        string globalId; //IFC’s element id, used mainly for UI highlighting
        string positionId; // the stable location (like "Floor2_Room10_LampSpot#1")
        string physicalId; // an identifier for the actual device (like "Lamp_ABC123")
    }

    // Struct to store maintenance history
    struct MaintenanceRecord {
        uint startTime;
        uint endTime;
        address technician;
        string oldPhysicalId; // capture the item’s physicalId at the start
        string newPhysicalId; // if replaced
        string technicianComment; // e.g. “Replaced lamp, tested”
    }
    // Set the PaymentManager after deployment
    function setPaymentManager(address _paymentMgr) external onlyAdmin {
        paymentManager = PaymentManager(payable(_paymentMgr));
    }
    // You might store a struct for completed maintenance that hasn't been paid yet:
    struct CompletedMaintenance {
        bool readyForPayment;
        address technician;
        uint suggestedAmount;
        bool isPaid; // New: whether we’ve paid it already
        uint paymentTimestamp; // New: block.timestamp of confirmPayment
        uint paidAmountWei;
        // NEW FIELDS FOR USER REIMBURSEMENT INFO:
        address userReimbursed;
        uint userReimbursedAmountWei;
    }
    mapping(uint => CompletedMaintenance[]) public completedMaintenances;

    // Mappings
    mapping(uint => Asset) public assets;
    mapping(uint => AssetMetadata) public assetMetadata;
    mapping(uint => MaintenanceRecord[]) public maintenanceHistory;
    mapping(address => Role) public userRoles;

    // For requesting Technician role
    mapping(address => bool) public technicianRequests;
    address[] public pendingTechnicians;

    uint public nextAssetId;
    address public owner;

    //user registration
    mapping(address => bool) public pendingUsers;
    address[] public pendingUsersList;
    mapping(uint256 => string[]) public predictiveHashes;

    event PredictiveHashStored(uint256 indexed assetId, string dataHash);

    // Mapping to track false fault reports per user
    mapping(address => uint256) public counterMiss;
    // Mapping to remember who reported the current fault for an asset (if any)
    mapping(uint256 => address) private faultReporter;

    // Events
    event AssetRegistered(
        uint indexed id,
        string category,
        string building,
        uint floor,
        uint room
    );
    event AssetDeleted(uint indexed id);
    event FaultReported(uint indexed id, string status, string faultType);
    event FaultCancelled(uint256 assetId, string reason, address punishedUser);
    event MaintenanceStarted(uint indexed id, address technician);
    event MaintenanceCompleted(
        uint indexed id,
        address technician,
        uint timestamp
    );
    event UserRegistrationRequested(address user);
    event UserApproved(address user);
    event UserDenied(address user);
    event TechnicianRequested(address indexed user);
    event TechnicianApproved(address indexed technician);
    event TechnicianDenied(address indexed user);

    // Constructor: contract deployer is Admin
    constructor() {
        owner = msg.sender;
        userRoles[owner] = Role.Admin;
        // Hard-code the user address:
        userRoles[0xe115B3335d6beFac13eb4eb19B187218d9B352Cf] = Role.User;

        // Hard-code the technician address:
        userRoles[0xDb8A806aD71485bF331700e9870624BdcF10EF82] = Role.Technician;
    }

    // Modifiers for role validation
    modifier onlyAdmin() {
        require(
            userRoles[msg.sender] == Role.Admin,
            "Only Admin can perform this action"
        );
        _;
    }

    // Modifier: Only Technician
    modifier onlyTechnician() {
        require(
            userRoles[msg.sender] == Role.Technician,
            "Only registered Technicians can perform maintenance"
        );
        _;
    }

    // Modifier: Only User
    modifier onlyUser() {
        require(
            userRoles[msg.sender] == Role.User,
            "Only registered Users can perform this action"
        );
        _;
    }

    // -------------------- Roles Logic---------------------

    // **NEW FUNCTION**: Get the role of a user
    function getRole(address user) public view returns (Role) {
        return userRoles[user];
    }

    // Register as a User
    function requestUserRegistration() public {
        require(
            userRoles[msg.sender] == Role.Unregistered,
            "Already registered"
        );
        pendingUsers[msg.sender] = true;
        pendingUsersList.push(msg.sender);
        emit UserRegistrationRequested(msg.sender);
    }
    function approveUser(address user) public onlyAdmin {
        require(pendingUsers[user], "Not pending");
        userRoles[user] = Role.User;
        pendingUsers[user] = false;
        for (uint i = 0; i < pendingUsersList.length; i++) {
            if (pendingUsersList[i] == user) {
                pendingUsersList[i] = pendingUsersList[
                    pendingUsersList.length - 1
                ];
                pendingUsersList.pop();
                break;
            }
        }
        emit UserApproved(user);
        paymentManager.reimburseUser(user, 0.01 ether);
    }

    function denyUser(address user) public onlyAdmin {
        require(pendingUsers[user], "Not pending");
        pendingUsers[user] = false;
        for (uint i = 0; i < pendingUsersList.length; i++) {
            if (pendingUsersList[i] == user) {
                pendingUsersList[i] = pendingUsersList[
                    pendingUsersList.length - 1
                ];
                pendingUsersList.pop();
                break;
            }
        }
        emit UserDenied(user);
    }

    function getPendingUsers() public view returns (address[] memory) {
        return pendingUsersList;
    }

    // Request to become a Technician (Admin approval needed)(puts you in pending array)
    function requestTechnicianRole() public {
        require(
            userRoles[msg.sender] == Role.User,
            "Only Users can request to be Technicians"
        );
        require(!technicianRequests[msg.sender], "Already requested");

        technicianRequests[msg.sender] = true; // Track request
        pendingTechnicians.push(msg.sender);
        emit TechnicianRequested(msg.sender);
    }

    // Admin approves a Technician
    function approveTechnician(address user) public onlyAdmin {
        require(technicianRequests[user], "No pending request");

        // Grant them Technician role
        userRoles[user] = Role.Technician;
        technicianRequests[user] = false; // Clear request after approval

        // Remove them from pendingTechnicians array
        for (uint i = 0; i < pendingTechnicians.length; i++) {
            if (pendingTechnicians[i] == user) {
                pendingTechnicians[i] = pendingTechnicians[
                    pendingTechnicians.length - 1
                ];
                pendingTechnicians.pop();
                break;
            }
        }

        emit TechnicianApproved(user);
    }

    // Admin can deny a Technician request
    // This keeps them as a normal User, but clears their pending status
    function denyTechnician(address user) public onlyAdmin {
        require(technicianRequests[user], "No pending request");

        technicianRequests[user] = false;

        // Remove them from pendingTechnicians array
        for (uint i = 0; i < pendingTechnicians.length; i++) {
            if (pendingTechnicians[i] == user) {
                pendingTechnicians[i] = pendingTechnicians[
                    pendingTechnicians.length - 1
                ];
                pendingTechnicians.pop();
                break;
            }
        }

        // They remain a "User" role, not upgraded
        emit TechnicianDenied(user);
    }

    // Helper to check if address has requested technician
    function hasRequestedTechnician(address user) public view returns (bool) {
        return technicianRequests[user];
    }

    // Return the array of all addresses currently pending
    function getPendingTechnicians() public view returns (address[] memory) {
        return pendingTechnicians;
    }

    // -------------------- Asset Logic ---------------------

    function registerAsset(
        string memory category,
        string memory building,
        uint floor,
        uint room,
        string memory brand,
        string memory model,
        string memory ipfsHash,
        string memory globalId,
        string memory positionId,
        string memory physicalId
    ) external onlyAdmin {
        uint assetId = nextAssetId;
        nextAssetId++;

        // Minimal fields in the main Asset
        Asset storage a = assets[assetId];
        a.id = assetId;
        a.isDeleted = false;
        a.technician = address(0);
        a.lastMaintenanceTimestamp = 0;
        a.status = "Operational";
        a.faultType = "";

        // The big fields go into AssetMetadata
        AssetMetadata storage meta = assetMetadata[assetId];
        meta.category = category;
        meta.building = building;
        meta.floor = floor;
        meta.room = room;
        meta.brand = brand;
        meta.model = model;
        meta.ipfsHash = ipfsHash;
        meta.globalId = globalId;
        meta.positionId = positionId;
        meta.physicalId = physicalId;

        emit AssetRegistered(assetId, category, building, floor, room);
    }

    // DELETE (mark isDeleted = true)
    function deleteAsset(uint _id) public onlyAdmin {
        require(_id < nextAssetId, "Asset does not exist");
        require(!assets[_id].isDeleted, "Asset already deleted");

        assets[_id].isDeleted = true;
        emit AssetDeleted(_id);
    }

    // REPORT A FAULT
    function reportFault(uint _id, string memory _faultType) public onlyUser {
        require(counterMiss[msg.sender] < 3, "You are banned from reporting faults");
        require(_id < nextAssetId, "Asset does not exist");
        require(!assets[_id].isDeleted, "Asset is deleted");
        require(
            keccak256(bytes(assets[_id].status)) ==
                keccak256(bytes("Operational")),
            "Asset must be operational to report a new fault"
        );
        // Update asset status to Broken and record fault details
        assets[_id].status = "Broken";
        assets[_id].faultType = _faultType;
        faultReporter[_id] = msg.sender;
        emit FaultReported(_id, "Broken", _faultType);
    }


    function cancelFault(uint256 _id, string calldata reason) public onlyAdmin 
    {
        require(_id < nextAssetId, "Asset does not exist");
        require(!assets[_id].isDeleted, "Asset is deleted");
        require(
            keccak256(bytes(assets[_id].status)) == keccak256(bytes("Broken")),
            "Asset must be broken to start maintenance"
        );

        address reporter = faultReporter[_id];
        require(reporter != address(0), "No recorded reporter for this fault");
        // **Increment false report counter for the user**
        counterMiss[reporter] += 1;

        // 2) Reset the asset to Operational (or whatever default status you want):
        assets[_id].status = "Operational";
        assets[_id].faultType = ""; // Clear the fault description if you want

        // 3) Emit event for off-chain logs
        emit FaultCancelled(_id, reason, reporter);
    }

    // START MAINTENANCE
    function startMaintenance(
        uint _id,
        string memory startComment
    ) public onlyTechnician {
        require(_id < nextAssetId, "Asset does not exist");
        require(!assets[_id].isDeleted, "Asset is deleted");
        require(
            keccak256(bytes(assets[_id].status)) == keccak256(bytes("Broken")),
            "Asset must be broken to start maintenance"
        );
        // read the current physicalId
        string memory currentPhysical = assetMetadata[_id].physicalId;

        // Record the start of maintenance. endTime is set to 0 for now.
        maintenanceHistory[_id].push(
            MaintenanceRecord({
                startTime: block.timestamp,
                endTime: 0,
                technician: msg.sender,
                oldPhysicalId: currentPhysical,
                newPhysicalId: "", // unknown yet
                technicianComment: startComment
            })
        );

        assets[_id].status = "Under Maintenance";
        assets[_id].technician = msg.sender;
        emit MaintenanceStarted(_id, msg.sender);
    }

    // COMPLETE MAINTENANCE
    function completeMaintenance(
        uint _id,
        string memory endComment
    ) public onlyTechnician {
        require(_id < nextAssetId, "Asset does not exist");
        require(!assets[_id].isDeleted, "Asset is deleted");
        require(
            keccak256(bytes(assets[_id].status)) ==
                keccak256(bytes("Under Maintenance")),
            "Asset must be under maintenance to complete"
        );

        // Update asset details
        assets[_id].status = "Operational";
        assets[_id].lastMaintenanceTimestamp = block.timestamp;
        assets[_id].faultType = "";

        // Retrieve the maintenance records for this asset
        MaintenanceRecord[] storage records = maintenanceHistory[_id];
        require(records.length > 0, "No maintenance record found");

        // Get the last maintenance record (assumed to be the active one)
        MaintenanceRecord storage lastRecord = records[records.length - 1];
        require(lastRecord.endTime == 0, "Maintenance already completed");

        // finalize
        lastRecord.endTime = block.timestamp;
        // add final comment if desired
        if (bytes(endComment).length > 0) {
            // you can concat or just overwrite
            // e.g. lastRecord.technicianComment = string(abi.encodePacked(lastRecord.technicianComment, " | ", endComment));
            lastRecord.technicianComment = endComment;
        }
        completedMaintenances[_id].push(
            CompletedMaintenance({
                readyForPayment: true,
                technician: msg.sender,
                suggestedAmount: 0,
                isPaid: false,
                paymentTimestamp: 0,
                paidAmountWei: 0,
                userReimbursed: address(0),
                userReimbursedAmountWei: 0
            })
        );

        emit MaintenanceCompleted(_id, msg.sender, block.timestamp);
    }

    function replacePhysicalItem(
        uint _id,
        string memory newPhysicalId
    ) public onlyTechnician {
        require(!assets[_id].isDeleted, "Asset is deleted");
        // optional check that asset is Under Maintenance, etc.

        // replace the device
        assetMetadata[_id].physicalId = newPhysicalId;

        // update last maintenance record
        MaintenanceRecord[] storage records = maintenanceHistory[_id];
        require(records.length > 0, "No active maintenance record");
        MaintenanceRecord storage rec = records[records.length - 1];
        require(rec.endTime == 0, "Maintenance ended");
        rec.newPhysicalId = newPhysicalId;
    }

    // 2) Admin confirms and triggers Payment:
    function confirmPayment(
        uint _id,
        uint technicianWei,
        address faultReporter,
        uint faultCostWei
    ) external onlyAdmin {
        CompletedMaintenance[] storage cmArray = completedMaintenances[_id];
        require(cmArray.length > 0, "No maintenance records for asset");
        uint index = cmArray.length - 1;
        CompletedMaintenance storage cm = cmArray[index];

        require(cm.readyForPayment && !cm.isPaid, "Not ready or already paid");

        // 1) Pay the technician
        paymentManager.payTechnician(cm.technician, technicianWei);

        // 2) Reimburse the user if we have a nonzero cost
        if (faultReporter != address(0) && faultCostWei > 0) {
            paymentManager.reimburseUser(faultReporter, faultCostWei);

            // Optionally record it in the struct so you see it in getCompletedMaintenance()
            cm.userReimbursed = faultReporter;
            cm.userReimbursedAmountWei = faultCostWei;
        }

        // 3) Mark maintenance as paid
        cm.readyForPayment = false;
        cm.isPaid = true;
        cm.paymentTimestamp = block.timestamp;
        cm.paidAmountWei = technicianWei;
    }

    // GET MAINTENANCE HISTORY
    function getMaintenanceHistory(
        uint _id
    ) public view returns (MaintenanceRecord[] memory) {
        return maintenanceHistory[_id];
    }

    function getTechnicianCompletedAssets(
        address tech
    ) public view returns (uint[] memory) {
        uint total = nextAssetId;
        uint count = 0;

        // Count how many *assets* have at least one record from 'tech'
        for (uint i = 0; i < total; i++) {
            CompletedMaintenance[] storage cmArray = completedMaintenances[i];
            for (uint j = 0; j < cmArray.length; j++) {
                if (cmArray[j].technician == tech) {
                    count++;
                    break; // only add asset i once
                }
            }
        }

        // Build the array of asset IDs
        uint[] memory result = new uint[](count);
        uint index = 0;
        for (uint i = 0; i < total; i++) {
            CompletedMaintenance[] storage cmArray = completedMaintenances[i];
            for (uint j = 0; j < cmArray.length; j++) {
                if (cmArray[j].technician == tech) {
                    result[index] = i;
                    index++;
                    break;
                }
            }
        }

        return result;
    }

    function getCompletedMaintenanceCount(uint _id) public view returns (uint) {
        return completedMaintenances[_id].length;
    }

    function getCompletedMaintenance(
        uint _id,
        uint index
    ) public view returns (CompletedMaintenance memory) {
        return completedMaintenances[_id][index];
    }
    function getAllCompletedMaintenance(
        uint _id
    ) public view returns (CompletedMaintenance[] memory) {
        return completedMaintenances[_id];
    }
    function storePredictiveHash(uint256 _assetId, string memory _dataHash) public {
        // Optionally require the caller to be an admin or authorized system
        // require(msg.sender == owner, "Not authorized");
        
        // Push the hash into the array
        predictiveHashes[_assetId].push(_dataHash);

        emit PredictiveHashStored(_assetId, _dataHash);
    }
    function getAssetStatus(uint _id) public view returns (string memory) {
    require(_id < nextAssetId, "Asset does not exist");
    return assets[_id].status; // e.g. "Operational", "Broken", or "Under Maintenance"
}


    
}
