import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { query, transaction } from '../db/database.js';

let token;

const resetTestData = async () => {
  await query('DELETE FROM payment_receipts');
  await query('DELETE FROM payments');
  await query('DELETE FROM invoices');
  await query('DELETE FROM installation_assignments');
  await query('DELETE FROM booking_services');
  await query('DELETE FROM bookings');
  await query('DELETE FROM decorations');
  await query('DELETE FROM customers');
  await query('DELETE FROM notifications');
  await query('DELETE FROM audit_logs');
};

beforeAll(async () => {
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'change-me-now' });

  token = loginRes.body.token;
});

beforeEach(async () => {
  await resetTestData();
});

describe.runIf(process.env.DATABASE_URL)('postgres real database enforcement', () => {
  it('enforces the overlap rule matrix for the same decoration and date', async () => {
    const customerRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Overlap Customer', phone: '0500001000', address: 'Jeddah' });

    const decorationRes = await request(app)
      .post('/api/decorations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Overlap Decor',
        description: 'Overlap matrix test',
        category: 'Wedding',
        basePrice: 2000,
        status: 'Available',
        availability: true
      });

    const basePayload = {
      customerId: customerRes.body.customer.id,
      decorationId: decorationRes.body.decoration.id,
      eventType: 'Wedding',
      eventDate: '2027-06-20',
      eventLocation: 'Jeddah Hall',
      notes: 'base booking',
      depositAmount: 0,
      services: []
    };

    const base = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...basePayload, startTime: '18:00', endTime: '22:00' });
    expect(base.status).toBe(201);

    const cases = [
      { label: 'A', startTime: '18:00', endTime: '22:00', allowed: false },
      { label: 'B', startTime: '20:00', endTime: '23:00', allowed: false },
      { label: 'C', startTime: '16:00', endTime: '19:00', allowed: false },
      { label: 'D', startTime: '19:00', endTime: '21:00', allowed: false },
      { label: 'E', startTime: '14:00', endTime: '18:00', allowed: true },
      { label: 'F', startTime: '22:00', endTime: '23:00', allowed: true }
    ];

    for (const testCase of cases) {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...basePayload,
          customerId: customerRes.body.customer.id,
          decorationId: decorationRes.body.decoration.id,
          eventLocation: 'Jeddah Hall',
          startTime: testCase.startTime,
          endTime: testCase.endTime,
          notes: `case-${testCase.label}`
        });

      if (testCase.allowed) {
        expect(res.status).toBe(201);
      } else {
        expect(res.status).toBe(409);
      }
    }
  });

  it('serializes concurrent overlapping booking requests with exactly one winner', async () => {
    const customerRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Concurrent Customer', phone: '0500002000', address: 'Riyadh' });

    const decorationRes = await request(app)
      .post('/api/decorations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Concurrent Decor',
        description: 'Concurrency test',
        category: 'Wedding',
        basePrice: 3000,
        status: 'Available',
        availability: true
      });

    const payload = {
      customerId: customerRes.body.customer.id,
      decorationId: decorationRes.body.decoration.id,
      eventType: 'Wedding',
      eventDate: '2027-07-05',
      startTime: '18:00',
      endTime: '22:00',
      eventLocation: 'Riyadh Hall',
      notes: 'concurrent',
      depositAmount: 0,
      services: []
    };

    const results = await Promise.all([
      request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`).send(payload),
      request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`).send({
        ...payload,
        notes: 'concurrent second',
        customerId: customerRes.body.customer.id,
        decorationId: decorationRes.body.decoration.id,
        startTime: '20:00',
        endTime: '23:00'
      })
    ]);

    const succeeded = results.filter((res) => res.status === 201).length;
    const conflicts = results.filter((res) => res.status === 409).length;

    expect(succeeded).toBe(1);
    expect(conflicts).toBe(1);

    const countRes = await query("SELECT COUNT(*)::int AS count FROM bookings WHERE decoration_id = $1 AND event_date = $2", [decorationRes.body.decoration.id, '2027-07-05']);
    expect(Number(countRes.rows[0].count)).toBe(1);
  });

  it('rolls back the booking when a later database operation fails', async () => {
    const customerRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Rollback Customer', phone: '0500003000', address: 'Jeddah' });

    const decorationRes = await request(app)
      .post('/api/decorations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Rollback Decor',
        description: 'Rollback validation',
        category: 'Wedding',
        basePrice: 1800,
        status: 'Available',
        availability: true
      });

    const serviceRes = await query('INSERT INTO services (id, name, description, price, quantity, status) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING id', ['Rollback Service', 'test service', 150, 1, 'Active']);

    await expect(
      transaction(async (client) => {
        await client.query(
          `INSERT INTO bookings (
            id, customer_id, decoration_id, event_type, event_date, start_time, end_time,
            event_location, notes, subtotal, discount, total_amount, paid_amount,
            remaining_amount, payment_status, booking_status, installation_status, deposit_amount
          ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 1500, 0, 1500, 0, 1500, 'Unpaid', 'Draft', 'Pending', 0)`,
          [customerRes.body.customer.id, decorationRes.body.decoration.id, 'Wedding', '2027-08-10', '18:00', '22:00', 'Jeddah Hall', 'rollback scenario']
        );

        await client.query(
          `INSERT INTO booking_services (id, booking_id, service_id, quantity, unit_price, total_price)
           VALUES (gen_random_uuid(), (SELECT id FROM bookings WHERE customer_id = $1 AND event_date = $2 ORDER BY created_at DESC LIMIT 1), $3, $4, $5, $6)`,
          [customerRes.body.customer.id, '2027-08-10', serviceRes.rows[0].id, 0, 150, 0]
        );
      })
    ).rejects.toThrow();

    const bookings = await query('SELECT COUNT(*)::int AS count FROM bookings WHERE decoration_id = $1 AND event_date = $2', [decorationRes.body.decoration.id, '2027-08-10']);
    expect(Number(bookings.rows[0].count)).toBe(0);

    const validRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customerRes.body.customer.id,
        decorationId: decorationRes.body.decoration.id,
        eventType: 'Wedding',
        eventDate: '2027-08-11',
        startTime: '18:00',
        endTime: '22:00',
        eventLocation: 'Jeddah Hall',
        notes: 'valid after rollback',
        depositAmount: 0,
        services: []
      });

    expect(validRes.status).toBe(201);
  });

  it('enforces PostgreSQL foreign key and constraint checks directly', async () => {
    const { rows: [badCustomer] } = await query('SELECT gen_random_uuid() AS id');
    const { rows: [badDecoration] } = await query('SELECT gen_random_uuid() AS id');
    const { rows: [badBooking] } = await query('SELECT gen_random_uuid() AS id');

    await expect(query('INSERT INTO bookings (id, customer_id, decoration_id, event_type, event_date, start_time, end_time, event_location, subtotal, discount, total_amount, paid_amount, remaining_amount, payment_status, booking_status, installation_status, deposit_amount) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 0, 0, 0, 0, 0, $8, $9, $10, 0)', [badCustomer.id, badDecoration.id, 'Wedding', '2027-09-01', '18:00', '22:00', 'Jeddah Hall', 'Unpaid', 'Draft', 'Pending'])).rejects.toThrow();
    await expect(query('INSERT INTO payments (id, booking_id, amount, payment_method, reference_number, notes) VALUES (gen_random_uuid(), $1, 100, $2, $3, $4)', [badBooking.id, 'Cash', 'INVALID-BID', 'bad booking'])).rejects.toThrow();
    await expect(query('INSERT INTO customers (id, full_name, phone) VALUES ($1, $2, $3)', ['not-a-uuid', 'Bad', '0500004000'])).rejects.toThrow();
    await expect(query('INSERT INTO customers (id, full_name, phone) VALUES (gen_random_uuid(), NULL, $1)', ['0500004001'])).rejects.toThrow();
    await expect(query('INSERT INTO customers (id, full_name, phone) VALUES (gen_random_uuid(), $1, $2)', ['D', '0500004002'])).resolves.toBeTruthy();
    await expect(query('INSERT INTO customers (id, full_name, phone) VALUES (gen_random_uuid(), $1, $2)', ['D', '0500004002'])).rejects.toThrow();
  });
});

describe('booking system api', () => {
  it('creates a customer', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Ahmed Ali',
        phone: '0501234567',
        alternativePhone: '0557654321',
        address: 'Riyadh',
        notes: 'VIP customer'
      });

    expect(res.status).toBe(201);
    expect(res.body.customer).toHaveProperty('id');
  });

  it('creates a decoration', async () => {
    const res = await request(app)
      .post('/api/decorations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Royal Wedding',
        description: 'Luxury wedding decor',
        category: 'Wedding',
        basePrice: 1200,
        status: 'Available',
        availability: true,
        notes: 'Premium set'
      });

    expect(res.status).toBe(201);
    expect(res.body.decoration).toHaveProperty('id');
  });

  it('creates booking and calculates totals with deposit', async () => {
    const customerRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Nora Salem', phone: '0500000001', address: 'Jeddah' });

    const decorationRes = await request(app)
      .post('/api/decorations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Modern Party',
        description: 'Modern decor',
        category: 'Birthday',
        basePrice: 900,
        status: 'Available',
        availability: true
      });

    const bookingRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customerRes.body.customer.id,
        decorationId: decorationRes.body.decoration.id,
        eventType: 'Birthday',
        eventDate: '2027-01-15',
        startTime: '18:00',
        endTime: '22:00',
        eventLocation: 'Jeddah Event Hall',
        notes: 'Birthday party',
        depositAmount: 300,
        services: [],
        discount: 50
      });

    expect(bookingRes.status).toBe(201);
    expect(bookingRes.body.booking.totalAmount).toBe(850);
    expect(bookingRes.body.booking.paidAmount).toBe(300);
    expect(bookingRes.body.booking.remainingAmount).toBe(550);
  });

  it('rejects a booking conflict for the same decoration in the same slot', async () => {
    const customerRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Conflict User', phone: '0500000022', address: 'Dammam' });

    const decorationRes = await request(app)
      .post('/api/decorations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Conflict Decor',
        description: 'Used for conflict check',
        category: 'Wedding',
        basePrice: 1500,
        status: 'Available',
        availability: true
      });

    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customerRes.body.customer.id,
        decorationId: decorationRes.body.decoration.id,
        eventType: 'Wedding',
        eventDate: '2027-02-10',
        startTime: '16:00',
        endTime: '20:00',
        eventLocation: 'Jeddah',
        notes: 'First booking',
        depositAmount: 0,
        services: []
      });

    const conflictRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customerRes.body.customer.id,
        decorationId: decorationRes.body.decoration.id,
        eventType: 'Wedding',
        eventDate: '2027-02-10',
        startTime: '17:00',
        endTime: '19:30',
        eventLocation: 'Jeddah',
        notes: 'Second booking',
        depositAmount: 0,
        services: []
      });

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.message).toMatch(/unavailable/i);
  });

  it('prevents payment above remaining balance', async () => {
    const customerRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Pay User', phone: '0500000033', address: 'Mecca' });

    const decorationRes = await request(app)
      .post('/api/decorations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Pay Decor',
        description: 'For payment validation',
        category: 'Corporate',
        basePrice: 800,
        status: 'Available',
        availability: true
      });

    const bookingRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customerRes.body.customer.id,
        decorationId: decorationRes.body.decoration.id,
        eventType: 'Corporate',
        eventDate: '2027-03-10',
        startTime: '09:00',
        endTime: '12:00',
        eventLocation: 'Riyadh',
        depositAmount: 200,
        services: []
      });

    const paymentRes = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        bookingId: bookingRes.body.booking.id,
        amount: 1000,
        paymentMethod: 'Cash',
        referenceNumber: 'REF-1000'
      });

    expect(paymentRes.status).toBe(400);
  });

  it('rejects invalid UUIDs gracefully and records an audit log entry', async () => {
    const customerRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Audit Customer', phone: '0500000040', address: 'Jeddah' });

    const decorationRes = await request(app)
      .post('/api/decorations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Audit Decor',
        description: 'Audit validation',
        category: 'Wedding',
        basePrice: 1500,
        status: 'Available',
        availability: true
      });

    const bookingRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customerRes.body.customer.id,
        decorationId: decorationRes.body.decoration.id,
        eventType: 'Wedding',
        eventDate: '2027-04-15',
        startTime: '18:00',
        endTime: '22:00',
        eventLocation: 'Jeddah Hall',
        depositAmount: 0,
        services: []
      });

    const invalidPaymentRes = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingId: 'not-real', amount: 100, paymentMethod: 'Cash' });

    expect(invalidPaymentRes.status).toBe(400);
    expect(invalidPaymentRes.body.message).toMatch(/uuid|booking/i);

    const logsRes = await request(app)
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${token}`);

    expect(logsRes.status).toBe(200);
    expect(Array.isArray(logsRes.body.logs)).toBe(true);
    expect(logsRes.body.logs.length).toBeGreaterThan(0);

    const bookingId = bookingRes.body.booking.id;
    const employeeRes = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Install Tech', phone: '0500000045', employeeType: 'Installation', gender: 'Male', status: 'Active' });

    const assignmentRes = await request(app)
      .post('/api/installations')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingId, employeeId: employeeRes.body.employee.id, assignedDate: '2027-04-16', installationDate: '2027-04-17', installationTime: '10:00', status: 'Assigned' });

    expect(assignmentRes.status).toBe(201);

    const assignmentUpdateRes = await request(app)
      .put(`/api/installations/${assignmentRes.body.assignment.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'Completed', installationDate: '2027-04-17', installationTime: '12:00' });

    expect(assignmentUpdateRes.status).toBe(200);
    expect(assignmentUpdateRes.body.assignment.status).toBe('Completed');
  });
});
