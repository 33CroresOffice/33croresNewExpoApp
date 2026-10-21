import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Platform } from 'react-native';
import { HelpCircle, X } from 'lucide-react-native';
import { usePathname } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';

type HelpEntry = {
  title: string;
  purpose: string;
  features: string[];
  steps: string[];
};

const HELP_CONTENT: Record<string, HelpEntry> = {
  index: {
    title: 'Dashboard',
    purpose: 'This is your control center. It shows a quick summary of the whole business — today\'s orders, customers, riders, revenue and anything that needs attention.',
    features: [
      'Summary cards for orders, customers, riders and revenue',
      'Today\'s delivery status at a glance',
      'Quick alerts for pending payments or unassigned orders',
      'Shortcuts to the most used pages',
    ],
    steps: [
      'Start here every day to see what needs attention.',
      'Click any summary card to open that section in full.',
      'Use the sidebar on the left to go to any detailed page.',
    ],
  },
  'automation-dashboard': {
    title: 'Automation',
    purpose: 'This page monitors all automatic jobs that run in the background — like daily order creation, rider assignment and renewal reminders — and shows if they are running successfully.',
    features: [
      'Health status of each automation (running, paused, failed)',
      'Last run time and next scheduled run',
      'Run history with success/failure records',
      'Manual run option for supported automations',
    ],
    steps: [
      'Open this page when you suspect something did not run automatically.',
      'Check the status and last run time of the automation in question.',
      'If a job failed, use Cron Management (System menu) to inspect or re-enable it.',
    ],
  },
  'feature-management': {
    title: 'Feature Management',
    purpose: 'Lets you switch app features on or off for everyone without changing code — for example, hiding the Pooja section during off-season.',
    features: [
      'List of all app features with on/off toggles',
      'Changes apply to customers immediately',
      'Only Super Admins can access this page',
    ],
    steps: [
      'Find the feature you want to control.',
      'Use the toggle to enable or disable it.',
      'Open the customer app to confirm the feature appears or disappears.',
    ],
  },
  orders: {
    title: 'Orders',
    purpose: 'The master list of every customer order — subscription deliveries and one-time orders — with their current status from scheduled to delivered.',
    features: [
      'Filter by date, status, customer or rider',
      'Order status tracking: scheduled, out for delivery, delivered, failed',
      'Open any order for full details and delivery history',
      'Search by customer name or order number',
    ],
    steps: [
      'Pick a date and status filter to find the orders you want.',
      'Click an order to see customer, address, rider and delivery details.',
      'If an order failed, open it and follow up with the rider or customer.',
    ],
  },
  'delivery-tomorrow': {
    title: 'Tomorrow Delivery',
    purpose: 'Shows all orders scheduled for tomorrow so you can plan procurement and rider routes a day ahead.',
    features: [
      'List of tomorrow\'s expected deliveries grouped by area',
      'Item quantity totals for procurement planning',
      'Customer address and contact for each delivery',
    ],
    steps: [
      'Review this list at the end of each day.',
      'Check the item totals against tomorrow\'s flower procurement.',
      'Make sure every delivery has a rider assigned (in Assignments).',
    ],
  },
  'create-subscription': {
    title: 'New Subscription',
    purpose: 'Creates a new flower delivery subscription for a customer — choosing the plan, delivery address, start date and payment.',
    features: [
      'Search and select an existing customer',
      'Choose a plan, frequency and start date',
      'Record payment mode and amount',
      'Subscription starts generating daily orders automatically',
    ],
    steps: [
      'Search for the customer (they must already have an account).',
      'Select the plan and the delivery address.',
      'Set the start date and enter payment details.',
      'Save — orders will be generated automatically each morning.',
    ],
  },
  'customize-order': {
    title: 'Customize Order',
    purpose: 'Lets you change what a customer receives on specific days — different flowers, quantities or skip a delivery.',
    features: [
      'Pick a customer and a date to customize',
      'Change items or quantities for that day only',
      'Skip or add a delivery for a single day',
      'Normal schedule continues on other days',
    ],
    steps: [
      'Search for the customer\'s subscription.',
      'Choose the date you want to change.',
      'Adjust the items or skip the delivery and save.',
    ],
  },
  'operations-customers': {
    title: 'Customers (Operations)',
    purpose: 'The operations view of all customers, focused on their active subscriptions and delivery status rather than marketing.',
    features: [
      'Customer list with subscription status',
      'Delivery address and locality information',
      'Jump to a customer\'s full profile and orders',
    ],
    steps: [
      'Search for a customer by name or phone.',
      'Click a customer to see subscriptions, orders and rider details.',
    ],
  },
  'payment-history': {
    title: 'Payment History',
    purpose: 'A complete record of every payment made by customers — successful, pending and failed — for reconciliation.',
    features: [
      'All payments with date, amount, mode and status',
      'Filter by customer, date range or payment status',
      'Match payments against subscriptions',
    ],
    steps: [
      'Filter by date or status to find payments.',
      'Use this list to reconcile with your bank or payment gateway statements.',
    ],
  },
  'check-payment': {
    title: 'Check Payment',
    purpose: 'A quick lookup tool to verify whether a specific payment went through, without opening the customer\'s full profile.',
    features: [
      'Search by payment ID, customer or order',
      'Shows payment status and linked order instantly',
    ],
    steps: [
      'Enter the customer name, phone or payment reference.',
      'Check the status shown — paid, pending or failed.',
    ],
  },
  'daily-requirements': {
    title: 'Daily Requirements',
    purpose: 'Calculates the total quantity of each flower needed for tomorrow\'s deliveries, so you know exactly what to buy from vendors.',
    features: [
      'Auto-calculated flower totals from all upcoming orders',
      'Breakdown by flower type and unit (kg, bunch, pieces)',
      'Creates procurement orders directly from requirements',
    ],
    steps: [
      'Open this page each evening for the next day\'s needs.',
      'Compare required quantities with current stock.',
      'Click through to Procurement Orders to place vendor orders.',
    ],
  },
  'procurement-orders': {
    title: 'Procurement Orders',
    purpose: 'Track flower purchases from vendors — from placing the order to vendor confirmation, pickup and warehouse receipt.',
    features: [
      'Create procurement orders with items and quantities',
      'Vendor confirms prices on the vendor app',
      'Track pickup by riders and receipt at warehouse',
      'Payment status for each order',
    ],
    steps: [
      'Create a new order or open an existing one.',
      'Send items to the vendor for price confirmation.',
      'After prices are confirmed, arrange pickup and mark it picked up.',
      'When flowers arrive, record them in Warehouse Receipts.',
    ],
  },
  'procurement-order-detail': {
    title: 'Procurement Order Detail',
    purpose: 'The full view of one purchase order — every item, confirmed vendor price, pickup status and payment record.',
    features: [
      'Item-by-item price and quantity breakdown',
      'Vendor price confirmations from the vendor app',
      'Pickup rider assignment and timing',
      'Record vendor payments against this order',
    ],
    steps: [
      'Review the vendor-confirmed prices on each item.',
      'Assign a pickup rider when the flowers are ready.',
      'Record any advance or final payment made to the vendor.',
    ],
  },
  vendors: {
    title: 'Vendors',
    purpose: 'Your directory of flower vendors — who they are, what they sell, their prices and payment history.',
    features: [
      'Vendor list with contact details and location',
      'Flowers supplied by each vendor with rates',
      'Outstanding payment balance per vendor',
      'Open a vendor for full details and order history',
    ],
    steps: [
      'Click a vendor to see their flowers, prices and payments.',
      'Use Vendor Payments (Finance) to settle dues.',
    ],
  },
  'vendor-detail': {
    title: 'Vendor Detail',
    purpose: 'Everything about one vendor: their flower catalogue with daily prices, procurement orders and payments.',
    features: [
      'Flower list with rates managed by the vendor',
      'All procurement orders placed with this vendor',
      'Payment history and outstanding balance',
      'QR code and contact details',
    ],
    steps: [
      'Review current flower rates before placing orders.',
      'Add flowers the vendor supplies if missing.',
      'Track pending payments at the bottom of the page.',
    ],
  },
  'vendor-add-flowers': {
    title: 'Add Vendor Flowers',
    purpose: 'Adds or updates the flowers a particular vendor supplies, along with their prices and units.',
    features: [
      'Pick flower types from the master list',
      'Set price per unit for each flower',
      'Only affects this vendor\'s catalogue',
    ],
    steps: [
      'Select the flower type.',
      'Enter the agreed price and unit.',
      'Save — the vendor can now confirm prices on these items.',
    ],
  },
  'warehouse-receipts': {
    title: 'Warehouse Receipts',
    purpose: 'Records the flowers that physically arrive at your warehouse from vendors, so stock matches what was purchased.',
    features: [
      'List of incoming procurement shipments',
      'Record received quantities against ordered quantities',
      'Spot short deliveries or quality issues',
    ],
    steps: [
      'When a vendor shipment arrives, open the matching receipt.',
      'Enter the actual quantity received per item.',
      'Report any shortage to the vendor and adjust payments if needed.',
    ],
  },
  'record-vendor-payment': {
    title: 'Record Vendor Payment',
    purpose: 'Records a payment you made to a vendor and links it to the right purchase orders.',
    features: [
      'Choose vendor, amount, mode and date',
      'Link the payment to pending procurement orders',
      'Updates the vendor\'s outstanding balance',
    ],
    steps: [
      'Select the vendor you paid.',
      'Enter the amount and payment mode (cash, UPI, bank).',
      'Link it to the relevant purchase order and save.',
    ],
  },
  plans: {
    title: 'Plans',
    purpose: 'Manages the subscription plans customers can buy — name, flowers included, price, frequency and photos.',
    features: [
      'Create and edit subscription plans',
      'Set price, per-day price and delivery frequency',
      'Upload plan photos shown in the customer app',
      'Choose which plans are visible to customers',
    ],
    steps: [
      'Click a plan to edit, or create a new one.',
      'Update price, items and photos as needed.',
      'Use "Show in customer plans" to control visibility.',
    ],
  },
  'pooja-manage': {
    title: 'Puja Manage',
    purpose: 'Controls the Pooja section — which pooja packages are offered, their items, pricing and pandit assignments.',
    features: [
      'Pooja package list with items and prices',
      'Enable or disable pooja offerings',
      'Link pooja items and categories',
    ],
    steps: [
      'Select a pooja to manage its details.',
      'Adjust items, pricing and availability.',
      'Save — changes appear in the customer app immediately.',
    ],
  },
  'pooja-item-categories': {
    title: 'Pooja Item Categories',
    purpose: 'Organizes pooja items into categories (like flowers, sweets, diyas) so customers can browse them easily.',
    features: [
      'Create, rename and reorder categories',
      'Each category holds related pooja items',
    ],
    steps: [
      'Add a category for each group of items.',
      'Assign items to categories in the Pooja Items page.',
    ],
  },
  'pooja-items': {
    title: 'Pooja Items',
    purpose: 'The master list of all pooja items customers can order — with names, prices, photos and availability.',
    features: [
      'Add or edit pooja items with price and photo',
      'Mark items in or out of stock',
      'Group items under categories',
    ],
    steps: [
      'Add new items with a clear photo and price.',
      'Turn off availability when an item runs out.',
    ],
  },
  'flower-types': {
    title: 'Flower Types',
    purpose: 'The master list of flower varieties used across plans and procurement — with units, seasons and photos.',
    features: [
      'Add new flower types with photo and unit type',
      'Set available months for seasonal flowers',
      'Used by plans, requirements and vendors',
    ],
    steps: [
      'Add a flower type before using it in any plan.',
      'Set the correct unit (kg, bunch, piece) — it affects procurement math.',
      'Set available months so seasonal flowers are handled correctly.',
    ],
  },
  'flower-availability': {
    title: 'Flower Availability',
    purpose: 'Tracks which flowers are currently available from vendors and in what quantity, so plans can be adjusted in season or shortage.',
    features: [
      'Per-flower availability calendar',
      'Mark flowers scarce or unavailable',
      'Helps decide plan substitutions',
    ],
    steps: [
      'Update availability when vendors report stock changes.',
      'If a flower is scarce, adjust plans or notify customers.',
    ],
  },
  localities: {
    title: 'Localities',
    purpose: 'The list of delivery areas/localities you serve, each with a unique code used in customer addresses and route planning.',
    features: [
      'Add or edit localities with auto-generated codes',
      'Used when customers enter their address',
      'Helps group deliveries by area',
    ],
    steps: [
      'Add a locality before customers can select it.',
      'Keep names simple — customers see them in the address form.',
    ],
  },
  apartments: {
    title: 'Apartments',
    purpose: 'Registers apartment complexes inside your localities so customer addresses are precise and deliveries are grouped.',
    features: [
      'Add apartments linked to a locality',
      'Customers pick their apartment in the address form',
    ],
    steps: [
      'Choose the locality, then add the apartment name.',
      'Save — it becomes selectable for customers immediately.',
    ],
  },
  finance: {
    title: 'Finance Overview',
    purpose: 'A summary of the money side of the business — revenue received, vendor dues, rider payouts and expenses.',
    features: [
      'Total revenue and payments received',
      'Outstanding vendor and rider payouts',
      'Expense totals',
      'Links into each detailed finance page',
    ],
    steps: [
      'Review the overview to spot unusual numbers.',
      'Drill into Payment Received, Vendor Payments or Expenses for details.',
    ],
  },
  'finance-payments': {
    title: 'Payments Received',
    purpose: 'All money received from customers — subscription payments, custom orders and pooja bookings.',
    features: [
      'Income list with date, customer, amount and mode',
      'Filter by date range or payment mode',
      'Totals for the selected period',
    ],
    steps: [
      'Select a date range to see income for that period.',
      'Use it for daily cash-up and accounting.',
    ],
  },
  'vendor-payments': {
    title: 'Vendor Payments',
    purpose: 'Tracks what you owe each vendor and what you have already paid, based on confirmed procurement orders.',
    features: [
      'Outstanding balance per vendor',
      'Payment history per vendor',
      'Record new payments directly',
    ],
    steps: [
      'Check pending dues per vendor.',
      'Record payments after paying so balances stay accurate.',
    ],
  },
  'flower-payments': {
    title: 'Flower Payments',
    purpose: 'A focused view of all payments related to flower procurement — helpful when most of your spending is flowers.',
    features: [
      'Flower purchase payments in one list',
      'Paid vs pending totals',
    ],
    steps: [
      'Filter by vendor or date to review flower spending.',
      'Record any missing payments to keep totals correct.',
    ],
  },
  'rider-payouts': {
    title: 'Rider Payouts',
    purpose: 'Calculates and tracks what each rider should be paid — salary, deliveries and incentives — and what has been paid.',
    features: [
      'Per-rider payout summary for a period',
      'Delivery counts and incentive earnings',
      'Record payouts when salaries are paid',
    ],
    steps: [
      'Choose the payout period (usually monthly).',
      'Review each rider\'s deliveries and incentives.',
      'Record the payout once the salary is transferred.',
    ],
  },
  expenses: {
    title: 'Expenses',
    purpose: 'Records all business expenses other than flower purchases — rent, fuel, salaries, repairs and more.',
    features: [
      'Add expenses with category, amount and date',
      'Monthly totals by category',
    ],
    steps: [
      'Add each expense as it happens with a receipt note.',
      'Review monthly totals to control spending.',
    ],
  },
  ledger: {
    title: 'Ledger',
    purpose: 'A running account of money in and money out — combining customer payments, vendor payments, payouts and expenses.',
    features: [
      'Chronological transaction list',
      'Running balance',
      'Filter by date range and type',
    ],
    steps: [
      'Use the ledger for a single source of truth on cash flow.',
      'Reconcile against bank statements periodically.',
    ],
  },
  crm: {
    title: 'CRM Overview',
    purpose: 'Customer relationship management — understand customer behavior, follow up with leads and keep customers active.',
    features: [
      'Customer activity and churn indicators',
      'Pending follow-ups and tasks',
      'Links to Segments and Tasks',
    ],
    steps: [
      'Check for customers who stopped ordering and follow up.',
      'Assign follow-up tasks in the Tasks page.',
    ],
  },
  customers: {
    title: 'Customers',
    purpose: 'The complete customer directory — profiles, contact details, subscriptions, order history and payments.',
    features: [
      'Search by name or phone',
      'Open a customer for full profile, orders and payments',
      'See subscription and activity status',
    ],
    steps: [
      'Search for the customer and open their profile.',
      'Use this page to answer customer queries about their orders or payments.',
    ],
  },
  'crm-segments': {
    title: 'CRM Segments',
    purpose: 'Groups customers automatically by behavior — active, inactive, high value, new — so you can target messages and offers.',
    features: [
      'Pre-built and custom segments',
      'Customer counts per segment',
      'Use segments when sending notifications',
    ],
    steps: [
      'Pick a segment to see which customers belong to it.',
      'Use the segment in Send Notification to target the right people.',
    ],
  },
  'crm-tasks': {
    title: 'CRM Tasks',
    purpose: 'A to-do list for customer follow-ups — calls to make, renewals to chase, complaints to close.',
    features: [
      'Create tasks with due dates and assignees',
      'Mark tasks complete when done',
      'Overdue tasks are highlighted',
    ],
    steps: [
      'Create a task for each follow-up you promise.',
      'Review open tasks daily and complete them.',
    ],
  },
  'customer-logins': {
    title: 'Customer Logins',
    purpose: 'Shows when customers last opened the app or logged in, to spot disengaged customers.',
    features: [
      'Last login time per customer',
      'Login history for engagement tracking',
    ],
    steps: [
      'Sort by last login to find customers going quiet.',
      'Follow up with them before they churn.',
    ],
  },
  riders: {
    title: 'Riders',
    purpose: 'The complete list of delivery riders — their status, contact details, zones and performance.',
    features: [
      'Active/inactive rider status',
      'Open a rider for full profile, deliveries and attendance',
      'Add new riders',
      'Approve or reject rider applications',
    ],
    steps: [
      'Click a rider to see their detailed profile.',
      'Use Add Rider to onboard a new delivery person.',
    ],
  },
  'add-rider': {
    title: 'Add Rider',
    purpose: 'Registers a new delivery rider with their personal details, documents and salary terms.',
    features: [
      'Personal and contact details',
      'ID documents and photo upload',
      'Salary, zone and delivery deadline settings',
    ],
    steps: [
      'Fill in the rider\'s details and upload documents.',
      'Set their monthly salary and delivery zone.',
      'Save — the rider can then log in with their phone number.',
    ],
  },
  'edit-rider': {
    title: 'Edit Rider',
    purpose: 'Updates an existing rider\'s details — contact info, salary, zone, documents or status.',
    features: [
      'Change any rider detail',
      'Deactivate a rider who has left',
    ],
    steps: [
      'Make the needed changes and save.',
      'Deactivate rather than delete, to keep delivery history intact.',
    ],
  },
  'rider-detail': {
    title: 'Rider Profile',
    purpose: 'Everything about one rider — today\'s assigned orders, delivery history, attendance, leave, payouts and zones. Use the tabs to switch between sections.',
    features: [
      'Assigned Orders tab: today\'s (or any date\'s) deliveries with status counts',
      'Deliveries tab: completed delivery history with date filters',
      'Attendance, Leave, Payouts and Zones tabs',
      'Date filters default to Today (IST) and support Yesterday and custom ranges',
    ],
    steps: [
      'Open the Assigned Orders tab to see what the rider is delivering today.',
      'Use the date filter to review any past day — counts always match the list shown.',
      'Check attendance and leave tabs before approving payouts.',
    ],
  },
  'rider-assignment-system': {
    title: 'Assignment System',
    purpose: 'The control center for how orders get assigned to riders — including the automatic assignment rules and capacity settings.',
    features: [
      'Rider capacity and zone configuration',
      'Auto-assignment rules and their status',
      'Manual assignment tools',
    ],
    steps: [
      'Set rider capacity so automatic assignment knows each rider\'s load limit.',
      'Keep auto-assignment paused if you prefer to assign manually.',
    ],
  },
  'assigned-riders': {
    title: 'Assigned Riders',
    purpose: 'Shows which rider is assigned to which customers/subscriptions, so you always know who delivers where.',
    features: [
      'Customer-to-rider mapping',
      'Primary rider per subscription',
      'Reassign customers between riders',
    ],
    steps: [
      'Find a customer to see their current rider.',
      'Use reassign if you need to change who delivers to them.',
    ],
  },
  'rider-assignment-orders': {
    title: 'Assignment Orders',
    purpose: 'A focused list of orders that need riders — assign, reassign or track the assignment status of each.',
    features: [
      'Unassigned orders highlighted',
      'Assign a rider to any order manually',
      'See assignment status per order',
    ],
    steps: [
      'Review unassigned orders each morning.',
      'Assign a rider to each before the delivery window.',
    ],
  },
  'rider-assignments': {
    title: 'Assignments',
    purpose: 'The day-to-day assignment board — assign today\'s and tomorrow\'s orders to riders, bulk-assign and override assignments.',
    features: [
      'Assign a primary rider to a customer — they stay assigned for all scheduled days',
      'Bulk smart assignment (only if auto-assignment is enabled)',
      'Override/reassign with full history preserved',
      'Real-time status of every delivery',
    ],
    steps: [
      'Pick a customer\'s orders and assign a rider — that rider remains the primary rider.',
      'To change a rider, use Override — the old assignment is kept in history as "reassigned".',
      'Verify each order shows the correct rider before the delivery window.',
    ],
  },
  'manual-reassign': {
    title: 'Manual Reassign',
    purpose: 'Temporarily hands a rider\'s deliveries to another rider for a set number of days (like during leave), then restores the original rider automatically.',
    features: [
      'Choose the original rider and the temporary rider',
      'Set the date range for the temporary cover',
      'Original assignment is restored automatically afterwards',
    ],
    steps: [
      'Select the rider who will be away.',
      'Choose the covering rider and the date range.',
      'Confirm — orders in that window go to the covering rider, then revert automatically.',
    ],
  },
  'attendance-locations': {
    title: 'Attendance Locations',
    purpose: 'Sets the approved places where riders can check in for duty — riders must be near these points to mark attendance.',
    features: [
      'Add check-in locations on the map',
      'Radius control for how close riders must be',
    ],
    steps: [
      'Add your warehouse/shop location as a check-in point.',
      'Set a reasonable radius so riders can check in nearby.',
    ],
  },
  'rider-activity-logs': {
    title: 'Rider Activity Logs',
    purpose: 'A timestamped trail of everything riders do in the app — logins, status changes, assignment swaps — for accountability.',
    features: [
      'Filter by rider, action type and date',
      'Full audit trail of rider actions',
    ],
    steps: [
      'Use this to investigate disputes (was a delivery actually marked, when was a swap made).',
      'Filter by rider and date to review their activity.',
    ],
  },
  'rider-delivery-time': {
    title: 'Delivery Time',
    purpose: 'Sets when riders must finish deliveries — the global deadline and per-rider limits, used to flag late deliveries.',
    features: [
      'Global delivery deadline time',
      'Per-rider delivery time overrides',
      'Used in on-time delivery and incentive calculations',
    ],
    steps: [
      'Set the standard deadline (e.g. all deliveries before 9 AM).',
      'Override for riders with special routes if needed.',
    ],
  },
  'rider-incentives': {
    title: 'Rider Incentives',
    purpose: 'Defines and tracks bonus schemes for riders — on-time streaks, delivery targets, quality — and shows who earned what.',
    features: [
      'Create incentive schemes with criteria',
      'Automatic evaluation of rider performance',
      'Leaderboard and earnings per rider',
    ],
    steps: [
      'Create a scheme with its criteria and reward amount.',
      'Review evaluated results before adding incentives to payouts.',
    ],
  },
  'service-providers': {
    title: 'Service Providers',
    purpose: 'Manages pandits and other service professionals — their profiles, documents, approval status and services.',
    features: [
      'Approve or reject provider applications',
      'Review uploaded documents and photos',
      'Control which services each provider offers',
    ],
    steps: [
      'Review pending applications with their documents.',
      'Approve to make the provider visible to customers.',
    ],
  },
  'service-provider-detail': {
    title: 'Service Provider Detail',
    purpose: 'The full profile of one provider — documents, bookings, services and payment settings.',
    features: [
      'Document review and approval',
      'Booking history',
      'Service list and pricing overrides',
    ],
    steps: [
      'Verify documents before approving the provider.',
      'Review bookings and any payment issues below.',
    ],
  },
  'service-orders': {
    title: 'Service Orders',
    purpose: 'All pooja/service bookings made by customers — status, assigned provider, schedule and payment.',
    features: [
      'Booking list with status filters',
      'Assign or change the provider',
      'Open a booking for full details',
    ],
    steps: [
      'Review new bookings and assign a suitable provider.',
      'Track each booking through to completion.',
    ],
  },
  'service-order-detail': {
    title: 'Service Order Detail',
    purpose: 'The full view of one service booking — customer, provider, schedule, address, payment and arrival OTP.',
    features: [
      'Complete booking information',
      'Payment status',
      'Provider assignment',
    ],
    steps: [
      'Confirm the provider and schedule are correct.',
      'Follow up on pending payments if shown.',
    ],
  },
  'package-management': {
    title: 'Package Management',
    purpose: 'Manages the service packages (pooja packages) that customers can book with providers — contents, pricing and photos.',
    features: [
      'Create and edit packages',
      'Set price, items and duration',
      'Control package visibility',
    ],
    steps: [
      'Create a package with a clear name and price.',
      'Add the items included so customers know what they get.',
    ],
  },
  'package-detail': {
    title: 'Package Detail',
    purpose: 'The full view of one service package — its items, price, photo and booking statistics.',
    features: [
      'Edit package contents and pricing',
      'See how many times it was booked',
    ],
    steps: [
      'Update details and save — customers see changes immediately.',
    ],
  },
  'notification-module': {
    title: 'Notification Module',
    purpose: 'Controls all customer and rider notifications — which events send messages, on which channels (app, WhatsApp, SMS).',
    features: [
      'Event-based notification settings',
      'Enable/disable per event and channel',
      'Links to templates and delivery logs',
    ],
    steps: [
      'Pick an event (e.g. order delivered) to configure.',
      'Toggle the channels you want messages sent on.',
    ],
  },
  'notification-templates': {
    title: 'Notification Templates',
    purpose: 'The message texts used for each notification — edit wording and variables like {customer_name} or {delivery_date}.',
    features: [
      'Edit template text with variables',
      'Separate templates per channel and language',
      'Preview before saving',
    ],
    steps: [
      'Open the template you want to change.',
      'Edit the text, keeping the {variables} intact.',
      'Save — new messages use the updated text.',
    ],
  },
  'send-notification': {
    title: 'Send Notification',
    purpose: 'Manually send a message to chosen customers or riders — an announcement, holiday notice or a targeted segment message.',
    features: [
      'Choose audience: all customers, a segment or specific people',
      'Choose channel: app push, WhatsApp or SMS',
      'Send immediately or schedule',
    ],
    steps: [
      'Pick the audience carefully — everyone gets the message.',
      'Write the message or pick a template.',
      'Send and check Delivery Logs to confirm it went out.',
    ],
  },
  'notification-logs': {
    title: 'Delivery Logs',
    purpose: 'The record of every notification actually sent — to whom, on which channel, and whether it succeeded.',
    features: [
      'Filter by date, channel or recipient',
      'Success/failure status for each message',
    ],
    steps: [
      'Check here if a customer says they did not receive a message.',
      'Retry failed sends from Send Notification if needed.',
    ],
  },
  panji: {
    title: 'Panji Calendar',
    purpose: 'The festival and special-days calendar — used to plan flower demand spikes and send festival notifications.',
    features: [
      'Festival dates with significance notes',
      'Festival-based automatic notifications',
      'Plan procurement around big festival days',
    ],
    steps: [
      'Review upcoming festivals weekly.',
      'Expect higher demand on festival days and stock up accordingly.',
    ],
  },
  logs: {
    title: 'Activity Logs',
    purpose: 'A combined audit trail of important actions across the system — who did what and when.',
    features: [
      'Filter by user, action and date',
      'Covers admin actions and system events',
    ],
    steps: [
      'Use this when you need to trace when something changed.',
    ],
  },
  'admin-users': {
    title: 'Admin Users',
    purpose: 'Manages who can access this admin panel and with which role — create admins, change roles, deactivate access.',
    features: [
      'List of admin accounts with roles',
      'Create new admin logins',
      'Deactivate departed staff',
    ],
    steps: [
      'Add new staff with the lowest role that fits their job.',
      'Immediately deactivate accounts of anyone who leaves.',
    ],
  },
  'admin-login-logs': {
    title: 'Admin Login Logs',
    purpose: 'Records every admin sign-in — who logged in, when and from where — for security review.',
    features: [
      'Login time, admin and device per entry',
      'Spot unusual logins quickly',
    ],
    steps: [
      'Review periodically for unexpected logins.',
    ],
  },
  roles: {
    title: 'Roles & Access',
    purpose: 'Defines what each admin role can see and do — which menu modules are visible to Finance, Operations, CRM and custom roles.',
    features: [
      'Per-module access control per role',
      'Create custom roles with specific module access',
    ],
    steps: [
      'Edit a role to include or remove menu modules.',
      'Changes apply the next time that admin logs in (or refreshes).',
    ],
  },
  'secret-keys': {
    title: 'Secret Keys',
    purpose: 'Stores API keys and credentials (like WhatsApp or maps keys) used by the system — enter them once, the app uses them securely.',
    features: [
      'Add or update key values by name',
      'Keys are not shown in full after saving',
    ],
    steps: [
      'Only change a key when renewing or replacing a service credential.',
    ],
  },
  'cron-monitor': {
    title: 'Cron Monitor',
    purpose: 'Shows every scheduled background job, its schedule and whether its recent runs succeeded or failed.',
    features: [
      'Per-job schedule and last run result',
      'Run history with error details',
    ],
    steps: [
      'Check this page when something automatic did not happen (e.g. today\'s orders missing).',
      'A failed job will show its error — fix the cause or re-run it.',
    ],
  },
  'cron-management': {
    title: 'Cron Management',
    purpose: 'Lets you enable or disable each background job individually — for example keeping auto rider assignment paused while order generation stays on.',
    features: [
      'Every job with its purpose and schedule in plain language',
      'Per-job Enable/Disable switch',
      'Manual run option per job',
    ],
    steps: [
      'Find the job by its name and purpose description.',
      'Toggle Enable/Disable as needed — disabling stops it running automatically.',
      'Use manual run to execute a job immediately for testing.',
    ],
  },
};

const GENERIC_HELP: HelpEntry = {
  title: 'Help',
  purpose: 'This page is part of the 33 Crores admin panel. Use the sidebar to navigate between sections.',
  features: [
    'All admin sections are listed in the left sidebar',
    'Use the search box in the sidebar to find a page quickly',
  ],
  steps: [
    'Pick a section from the sidebar to get started.',
  ],
};

function getHelpForPath(pathname: string): HelpEntry {
  const segment = pathname.split('/').filter(Boolean).pop() ?? '';
  if (segment === 'index' || segment === '' || segment === '(admin)') {
    return HELP_CONTENT['index'];
  }
  return HELP_CONTENT[segment] ?? { ...GENERIC_HELP, title: 'Help' };
}

export default function AdminHelpButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const help = useMemo(() => getHelpForPath(pathname ?? ''), [pathname]);

  if (Platform.OS !== 'web') return null;

  return (
    <>
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        accessibilityLabel={`Help: ${help.title}`}
      >
        <HelpCircle size={19} color={Colors.white} strokeWidth={2} />
        <Text style={styles.fabText}>Help</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} activeOpacity={1} />
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={styles.headerRow}>
                <HelpCircle size={18} color={Colors.primary} strokeWidth={2} />
                <Text style={styles.title}>{help.title}</Text>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={18} color={Colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionLabel}>What is this page for?</Text>
              <Text style={styles.paragraph}>{help.purpose}</Text>

              <Text style={styles.sectionLabel}>What you can do here</Text>
              {help.features.map((f, i) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>{f}</Text>
                </View>
              ))}

              <Text style={styles.sectionLabel}>How to use it</Text>
              {help.steps.map((s, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{s}</Text>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setOpen(false)}>
              <Text style={styles.closeBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: Platform.select({ web: 'fixed' }) as any,
    bottom: 24,
    right: 24,
    zIndex: 900,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing[3],
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  fabText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.white,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing[5],
  },
  card: {
    width: 520,
    maxWidth: '100%',
    maxHeight: '82%',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
  },
  body: { paddingHorizontal: Spacing[5], paddingVertical: Spacing[4] },
  sectionLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: Spacing[3],
    marginBottom: Spacing[2],
  },
  paragraph: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    lineHeight: 21,
  },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2], marginBottom: Spacing[1] },
  bulletDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary, marginTop: 7 },
  bulletText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2], marginBottom: Spacing[2] },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11,
    color: Colors.primary,
  },
  stepText: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  closeBtn: {
    marginHorizontal: Spacing[5],
    marginVertical: Spacing[4],
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing[3],
    alignItems: 'center',
  },
  closeBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.white,
  },
});
