export interface AuthenticatedUser {
  userDb: string
  passwordDb: string
  groupDb: string
  initials: string
  region: string
  accessRights: string
  accessDate: string
  provider: string
  sex: string
  name: string
  userRegion: string
  email: string
  employeeSchema: string
}

export interface JwtPayload {
  userDb: string
  passwordDb: string
  initials: string
  name: string
  accessRights: string
  employeeSchema: string
  provider: string
  region: string
}
