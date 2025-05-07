const { ethers } = require("hardhat");

async function main() {
    console.log("Deploying PaymentManager...");
    const PaymentManager = await ethers.getContractFactory("PaymentManager");
    const paymentManager = await PaymentManager.deploy();
    await paymentManager.waitForDeployment();

    const paymentManagerAddress = await paymentManager.getAddress();
    console.log("PaymentManager deployed at:", paymentManagerAddress);


    console.log("Deploying AssetManager...");
    const AssetManager = await ethers.getContractFactory("AssetManager");
    const assetManager = await AssetManager.deploy();
    await assetManager.waitForDeployment();
  
    const assetManagerAddress = await assetManager.getAddress();
    console.log("AssetManager deployed at:", assetManagerAddress);

    // (Optional) If your AssetManager has `setPaymentManager(...)`
    // and your script can make a transaction as Admin, do:
    console.log("Setting PaymentManager in AssetManager...");
    const tx = await assetManager.setPaymentManager(paymentManagerAddress);
    await tx.wait();

    console.log("PaymentManager set successfully in AssetManager.");

    console.log("Setting AssetManager in PaymentManager...");
    const tx2 = await paymentManager.setAssetManager(assetManagerAddress);
    await tx2.wait();
    console.log("PaymentManager knows about AssetManager now.");
    let tx3 = await assetManager.registerAsset(
        "Lamp1",
        "BuildingA",
        1,
        101,
        "Philips",
        "ModelX",
        "bafkreiewjfijkxcs5wdhjwnebhs7dum5cvnjymb72ljb6fv2h2y4vtp72a",
        "0wl6RGv6L2yx2_OHNfdKbK",
        "P1",
        "LAMP001"
    );
    await tx3.wait();
    console.log("Asset 1 registrato.");

    tx3 = await assetManager.registerAsset(
        "Lamp2",
        "BuildingA",
        1,
        102,
        "Philips",
        "ModelX",
        "bafkreiekou4oijttzk5bstba4fs5s3umc3anknvs76syyvw26d2zpxkpje",
        "0wl6RGv6L2yx2_OHNfdKAc",
        "P2",
        "LAMP002"
    );
    await tx3.wait();
    console.log("Asset 2 registrato.");

    tx3 = await assetManager.registerAsset(
        "Lamp3",
        "BuildingA",
        1,
        103,
        "Philips",
        "ModelX",
        "bafkreido5pwtwpvxdwcnym52ythor3kabquhb2jw6auio6bfgjnfvk5ena",
        "3SL58PzJ54KPVwD7ZiAOXg",
        "P3",
        "LAMP003"
    );
    await tx3.wait();
    console.log("Asset 3 registrato.");

}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
