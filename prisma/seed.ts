import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Create admin user
  const adminPasswordHash = await bcrypt.hash('admin123', 10)
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: adminPasswordHash,
      role: UserRole.admin,
      isActive: true,
      isAiAgent: false,
    },
  })

  console.log('✅ Created admin user:', admin.username)

  // Create power user
  const powerUserPasswordHash = await bcrypt.hash('power123', 10)
  const powerUser = await prisma.user.upsert({
    where: { username: 'poweruser' },
    update: {},
    create: {
      username: 'poweruser',
      passwordHash: powerUserPasswordHash,
      role: UserRole.power_user,
      isActive: true,
      isAiAgent: false,
      createdById: admin.id,
    },
  })

  console.log('✅ Created power user:', powerUser.username)

  // Create test user
  const testUserPasswordHash = await bcrypt.hash('test123', 10)
  const testUser = await prisma.user.upsert({
    where: { username: 'testuser' },
    update: {},
    create: {
      username: 'testuser',
      passwordHash: testUserPasswordHash,
      role: UserRole.user,
      isActive: true,
      isAiAgent: false,
      createdById: admin.id,
    },
  })

  console.log('✅ Created test user:', testUser.username)

  console.log('🎉 Seeding completed!')
  console.log('\nDefault accounts:')
  console.log('Admin: admin / admin123')
  console.log('Power User: poweruser / power123')
  console.log('Test User: testuser / test123')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

