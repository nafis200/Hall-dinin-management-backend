const express = require('express');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const port = process.env.PORT || 5000;
const cors = require('cors');
const { default: axios } = require('axios');

// Middleware
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'https://assignment-12-80409.web.app',
      'https://assignment-12-80409.firebaseapp.com',
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
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
};

async function run() {
  try {
    const userCollection = client.db('HallDB').collection('accounts');
    const paymentCollection = client.db('HallDB').collection('payment');

    // Generate JWT Token
    app.post('/jwt', async (req, res) => {
      try {
        const user = req.body;
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: '1000h',
        });
        res.cookie('token', token, cookieOptions).send({ token });
      } catch (error) {
        res.status(500).send({ error: 'Failed to generate token' });
      }
    });

    // Logout
    app.post('/logout', (req, res) => {
      res.clearCookie('token', { ...cookieOptions, maxAge: 0 }).send({
        success: true,
      });
    });

    // Fetch Users
    app.get('/users', async (req, res) => {
      try {
        const result = await userCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch users' });
      }
    });

    // Add User
    app.post('/users', async (req, res) => {
      try {
        const user = req.body;
        const query = { email: user.email };
        const existingUser = await userCollection.findOne(query);
        if (existingUser) {
          return res.status(409).send({ message: 'User already exists' });
        }
        const result = await userCollection.insertOne(user);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: 'Failed to add user' });
      }
    });

    // Initiate SSLCommerz Payment
    app.post('/sslCommerce', async (req, res) => {
      try {
        const tranId = new ObjectId().toString();
        const initiateData = {
          store_id: process.env.SSLCOMMERZ_STORE_ID,
          store_passwd: process.env.SSLCOMMERZ_STORE_PASSWD,
          total_amount: 100,
          currency: 'BDT',
          tran_id: tranId,
          success_url: 'http://localhost:5000/success-payment',
          fail_url: 'http://localhost:5173/failure',
          cancel_url: 'http://localhost:5173/cancel',
          cus_name: req.body.name || 'Customer Name',
          cus_email: req.body.email || 'cust@yahoo.com',
          cus_add1: 'Dhaka',
          cus_city: 'Dhaka',
          cus_postcode: '1000',
          cus_country: 'Bangladesh',
          cus_phone: req.body.phone || '01711111111',
        };

        const response = await axios.post(
          'https://sandbox.sslcommerz.com/gwprocess/v4/api.php',
          initiateData,
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          }
        );

        const saveData = {
          paymentId: tranId,
          amount: initiateData.total_amount,
          status: 'pending',
        };
        await paymentCollection.insertOne(saveData);

        res.send({ paymentUrl: response.data.GatewayPageURL });
      } catch (error) {
        res.status(500).send({ error: 'Failed to initiate payment' });
      }
    });

    // Success Payment
    app.post('/success-payment', async (req, res) => {
      try {
        const successData = req.body;
        if (successData.status !== 'VALID') {
          throw new Error('Invalid payment');
        }
        const query = { paymentId: successData.tran_id };
        const update = { $set: { status: 'success' } };
        await paymentCollection.updateOne(query, update);
        res.redirect('http://localhost:5173/success');
      } catch (error) {
        res.status(400).send({ error: 'Failed to validate payment' });
      }
    });

    console.log('Connected to MongoDB!');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World! How are you?');
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
