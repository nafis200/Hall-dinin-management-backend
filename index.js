const express = require("express");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const port = process.env.PORT || 5000;
const cors = require("cors");
const { default: axios } = require("axios");

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://assignment-12-80409.web.app",
      "https://assignment-12-80409.firebaseapp.com",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// MongoDB URI and Client
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.f8w8siu.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Cookie Options
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
};

async function run() {
  try {
    const userCollection = client.db("HallDB").collection("accounts");
    const paymentCollection = client.db("HallDB").collection("payment");
    const FoodCollection = client.db("HallDB").collection("food");

    // Generate JWT Token
    app.post("/jwt", async (req, res) => {
      try {
        const user = req.body;
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: "1000h",
        });
        res.cookie("token", token, cookieOptions).send({ token });
      } catch (error) {
        res.status(500).send({ error: "Failed to generate token" });
      }
    });

    // Logout
    app.post("/logout", (req, res) => {
      res.clearCookie("token", { ...cookieOptions, maxAge: 0 }).send({
        success: true,
      });
    });

    // Fetch Users
    app.get("/users", async (req, res) => {
      try {
        const result = await userCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch users" });
      }
    });

    // Add User
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        const query = { email: user.email };
        const existingUser = await userCollection.findOne(query);
        if (existingUser) {
          return res.status(409).send({ message: "User already exists" });
        }
        const result = await userCollection.insertOne(user);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to add user" });
      }
    });

    // Food management

    app.post("/food", async (req, res) => {
      const foodData = req.body;
      console.log(foodData);
      try {
        const result = await FoodCollection.insertOne(foodData);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error inserting data: ", error);
        res.status(500).send({ message: "Internal Server Error", error });
      }
    });

    app.get("/food", async (req, res) => {
      try {
        const foods = await FoodCollection.find({}).toArray();
        res.status(200).send(foods);
      } catch (error) {
        console.error("Error retrieving data: ", error);
        res.status(500).send({ message: "Internal Server Error", error });
      }
    });

    // Initiate SSLCommerz Payment

    const axios = require("axios");
    const { ObjectId } = require("mongodb");

    app.post("/sslCommerce", async (req, res) => {
      const user = req.body.data;

      const tranId = new ObjectId().toString();
      const initiatedata = {
        store_id: "abcco66659d6617872",
        store_passwd: "abcco66659d6617872@ssl",
        total_amount: parseFloat(user.price),
        num_of_item: user.items.length,
        currency: "BDT",
        tran_id: tranId,
        success_url: "http://localhost:5000/success-payment",
        fail_url: "http://localhost:5000/failure-payment",
        cancel_url: "http://localhost:5000/cancel-payment",
        cus_name: user.name || "Customer Name",
        cus_email: user.email || "customer@example.com",
        cus_add1: "Dhaka",
        cus_add2: "Dhaka",
        cus_city: "Dhaka",
        cus_state: "Dhaka",
        cus_postcode: "1000",
        cus_country: "Bangladesh",
        cus_phone: user.phone || "01711111111",
        cus_fax: "100",
        shipping_method: "NO",
        product_name: user.items.join(", "),
        product_category: "General",
        product_profile: "general",
        multi_card_name: "mastercard,visacard,amexcard",
        value_a: "ref001_A",
        value_b: "ref002_B",
        value_c: "ref003_C",
        value_d: "ref004_D",
      };

      try {
        const response = await axios({
          method: "POST",
          url: "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
          data: initiatedata,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        });

        const saveData = {
          paymentId: tranId,
          foodId: user.foodId,
          email: user.email,
          price: parseFloat(user.price),
          status: "pending",
        };

        const save = await paymentCollection.insertOne(saveData);

        if (save) {
          res.send({
            paymentUrl: response.data.GatewayPageURL,
          });
        }
      } catch (error) {
        res.status(500).send({ error: "Failed to initiate payment" });
      }
    });

    app.post("/success-payment", async (req, res) => {
      const successData = req.body;
      const { tran_id } = successData;

      if (successData.status !== "VALID") {
        return res
          .status(400)
          .send({ error: "Unauthorized payment, invalid status" });
      }

      try {
        const query = {
          paymnetId: tran_id,
        };
        const update = {
          $set: {
            status: "success",
          },
        };

        // No payment status update and mango quantity update
        const paymentUpdateResult = await paymentCollection.updateOne(
          query,
          update
        );
        console.log(paymentUpdateResult);

        res.redirect("http://localhost:5000/success");
      } catch (error) {
        console.error("Error during success payment:", error);
        res.status(500).send({ error: "Failed to process payment success" });
      }
    });

    app.post("/failure-payment", async (req, res) => {
      // Failure route: just redirect to the failure page
      res.redirect("http://localhost:5000/failure"); // Redirect to local failure page
    });

    app.post("/cancel-payment", async (req, res) => {
      // Cancel route: handle cancel here if needed
      res.redirect("http://localhost:5000/cancel"); // Redirect to local cancel page
    });
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World! How are you?");
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
