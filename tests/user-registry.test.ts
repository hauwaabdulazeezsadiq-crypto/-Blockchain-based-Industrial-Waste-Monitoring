import { describe, expect, it, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface UserInfo {
  role: string;
  name: string;
  description: string;
  registeredAt: number;
  verified: boolean;
  active: boolean;
  verifier: string | null;
}

interface ContractState {
  users: Map<string, UserInfo>;
  roleCounts: Map<string, number>;
  paused: boolean;
  admin: string;
}

// Mock contract implementation
class UserRegistryMock {
  private state: ContractState = {
    users: new Map(),
    roleCounts: new Map(),
    paused: false,
    admin: "deployer",
  };

  private ERR_ALREADY_REGISTERED = 100;
  private ERR_NOT_REGISTERED = 101;
  private ERR_UNAUTHORIZED = 102;
  private ERR_INVALID_ROLE = 103;
  private ERR_INVALID_NAME = 104;
  private ERR_NOT_VERIFIED = 105;
  private ERR_ALREADY_VERIFIED = 106;
  private ERR_CONTRACT_PAUSED = 107;
  private ERR_INVALID_ADDRESS = 108;
  private ERR_MAX_LENGTH_EXCEEDED = 109;

  private ROLE_ADMIN = "admin";
  private ROLE_COMPANY = "company";
  private ROLE_FACILITY = "facility";
  private ROLE_REGULATOR = "regulator";

  private MAX_NAME_LENGTH = 100;
  private MAX_DESCRIPTION_LENGTH = 500;

  private blockHeight = 1; // Mock block height

  private incrementBlockHeight() {
    this.blockHeight++;
  }

  registerUser(caller: string, role: string, name: string, description: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_CONTRACT_PAUSED };
    }
    if (this.state.users.has(caller)) {
      return { ok: false, value: this.ERR_ALREADY_REGISTERED };
    }
    if (![this.ROLE_ADMIN, this.ROLE_COMPANY, this.ROLE_FACILITY, this.ROLE_REGULATOR].includes(role)) {
      return { ok: false, value: this.ERR_INVALID_ROLE };
    }
    if (name.length === 0 || name.length > this.MAX_NAME_LENGTH) {
      return { ok: false, value: this.ERR_INVALID_NAME };
    }
    if (description.length > this.MAX_DESCRIPTION_LENGTH) {
      return { ok: false, value: this.ERR_MAX_LENGTH_EXCEEDED };
    }
    this.state.users.set(caller, {
      role,
      name,
      description,
      registeredAt: this.blockHeight,
      verified: false,
      active: true,
      verifier: null,
    });
    const currentCount = this.state.roleCounts.get(role) ?? 0;
    this.state.roleCounts.set(role, currentCount + 1);
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  verifyUser(caller: string, user: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_CONTRACT_PAUSED };
    }
    const userInfo = this.state.users.get(user);
    if (!userInfo) {
      return { ok: false, value: this.ERR_NOT_REGISTERED };
    }
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (userInfo.verified) {
      return { ok: false, value: this.ERR_ALREADY_VERIFIED };
    }
    userInfo.verified = true;
    userInfo.verifier = caller;
    return { ok: true, value: true };
  }

  updateProfile(caller: string, name: string, description: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_CONTRACT_PAUSED };
    }
    const userInfo = this.state.users.get(caller);
    if (!userInfo) {
      return { ok: false, value: this.ERR_NOT_REGISTERED };
    }
    if (name.length === 0 || name.length > this.MAX_NAME_LENGTH) {
      return { ok: false, value: this.ERR_INVALID_NAME };
    }
    if (description.length > this.MAX_DESCRIPTION_LENGTH) {
      return { ok: false, value: this.ERR_MAX_LENGTH_EXCEEDED };
    }
    userInfo.name = name;
    userInfo.description = description;
    return { ok: true, value: true };
  }

  deactivateUser(caller: string, user: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_CONTRACT_PAUSED };
    }
    const userInfo = this.state.users.get(user);
    if (!userInfo) {
      return { ok: false, value: this.ERR_NOT_REGISTERED };
    }
    if (caller !== this.state.admin && caller !== user) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (!userInfo.active) {
      return { ok: false, value: this.ERR_NOT_REGISTERED }; // Treating inactive as not registered for error
    }
    userInfo.active = false;
    const currentCount = this.state.roleCounts.get(userInfo.role) ?? 0;
    if (currentCount > 0) {
      this.state.roleCounts.set(userInfo.role, currentCount - 1);
    }
    return { ok: true, value: true };
  }

  changeRole(caller: string, user: string, newRole: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_CONTRACT_PAUSED };
    }
    const userInfo = this.state.users.get(user);
    if (!userInfo) {
      return { ok: false, value: this.ERR_NOT_REGISTERED };
    }
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (![this.ROLE_ADMIN, this.ROLE_COMPANY, this.ROLE_FACILITY, this.ROLE_REGULATOR].includes(newRole)) {
      return { ok: false, value: this.ERR_INVALID_ROLE };
    }
    if (!userInfo.active) {
      return { ok: false, value: this.ERR_NOT_REGISTERED };
    }
    const oldRole = userInfo.role;
    userInfo.role = newRole;
    const oldCount = this.state.roleCounts.get(oldRole) ?? 0;
    if (oldCount > 0) {
      this.state.roleCounts.set(oldRole, oldCount - 1);
    }
    const newCount = this.state.roleCounts.get(newRole) ?? 0;
    this.state.roleCounts.set(newRole, newCount + 1);
    return { ok: true, value: true };
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = false;
    return { ok: true, value: true };
  }

  setAdmin(caller: string, newAdmin: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  getUserInfo(user: string): ClarityResponse<UserInfo | null> {
    return { ok: true, value: this.state.users.get(user) ?? null };
  }

  isRegistered(user: string): ClarityResponse<boolean> {
    return { ok: true, value: this.state.users.has(user) };
  }

  isVerified(user: string): ClarityResponse<boolean> {
    const userInfo = this.state.users.get(user);
    return { ok: true, value: userInfo ? userInfo.verified : false };
  }

  hasRole(user: string, role: string): ClarityResponse<boolean> {
    const userInfo = this.state.users.get(user);
    return { ok: true, value: userInfo ? (userInfo.verified && userInfo.active && userInfo.role === role) : false };
  }

  getRoleCount(role: string): ClarityResponse<number> {
    return { ok: true, value: this.state.roleCounts.get(role) ?? 0 };
  }

  getContractAdmin(): ClarityResponse<string> {
    return { ok: true, value: this.state.admin };
  }

  isContractPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  company: "company1",
  facility: "facility1",
  regulator: "regulator1",
  user: "user1",
};

describe("UserRegistry Contract", () => {
  let contract: UserRegistryMock;

  beforeEach(() => {
    contract = new UserRegistryMock();
  });

  it("should allow user to register with valid role and details", () => {
    const result = contract.registerUser(accounts.company, "company", "Test Company", "Description");
    expect(result).toEqual({ ok: true, value: true });

    const userInfo = contract.getUserInfo(accounts.company);
    expect(userInfo).toEqual({
      ok: true,
      value: expect.objectContaining({
        role: "company",
        name: "Test Company",
        verified: false,
        active: true,
      }),
    });

    const roleCount = contract.getRoleCount("company");
    expect(roleCount).toEqual({ ok: true, value: 1 });
  });

  it("should prevent registration with invalid role", () => {
    const result = contract.registerUser(accounts.company, "invalid", "Test", "Desc");
    expect(result).toEqual({ ok: false, value: 103 });
  });

  it("should prevent duplicate registration", () => {
    contract.registerUser(accounts.company, "company", "Test", "Desc");
    const result = contract.registerUser(accounts.company, "company", "Test2", "Desc2");
    expect(result).toEqual({ ok: false, value: 100 });
  });

  it("should allow admin to verify user", () => {
    contract.registerUser(accounts.company, "company", "Test", "Desc");
    const result = contract.verifyUser(accounts.deployer, accounts.company);
    expect(result).toEqual({ ok: true, value: true });

    const isVerified = contract.isVerified(accounts.company);
    expect(isVerified).toEqual({ ok: true, value: true });
  });

  it("should prevent non-admin from verifying user", () => {
    contract.registerUser(accounts.company, "company", "Test", "Desc");
    const result = contract.verifyUser(accounts.user, accounts.company);
    expect(result).toEqual({ ok: false, value: 102 });
  });

  it("should allow user to update profile", () => {
    contract.registerUser(accounts.company, "company", "Old Name", "Old Desc");
    const result = contract.updateProfile(accounts.company, "New Name", "New Desc");
    expect(result).toEqual({ ok: true, value: true });

    const userInfo = contract.getUserInfo(accounts.company);
    expect(userInfo).toEqual({
      ok: true,
      value: expect.objectContaining({
        name: "New Name",
        description: "New Desc",
      }),
    });
  });

  it("should prevent update with invalid name", () => {
    contract.registerUser(accounts.company, "company", "Test", "Desc");
    const result = contract.updateProfile(accounts.company, "", "New Desc");
    expect(result).toEqual({ ok: false, value: 104 });
  });

  it("should allow admin to deactivate user", () => {
    contract.registerUser(accounts.company, "company", "Test", "Desc");
    const result = contract.deactivateUser(accounts.deployer, accounts.company);
    expect(result).toEqual({ ok: true, value: true });

    const userInfo = contract.getUserInfo(accounts.company);
    expect(userInfo).toEqual({
      ok: true,
      value: expect.objectContaining({ active: false }),
    });

    const roleCount = contract.getRoleCount("company");
    expect(roleCount).toEqual({ ok: true, value: 0 });
  });

  it("should allow self-deactivation", () => {
    contract.registerUser(accounts.company, "company", "Test", "Desc");
    const result = contract.deactivateUser(accounts.company, accounts.company);
    expect(result).toEqual({ ok: true, value: true });
  });

  it("should prevent non-authorized deactivation", () => {
    contract.registerUser(accounts.company, "company", "Test", "Desc");
    const result = contract.deactivateUser(accounts.user, accounts.company);
    expect(result).toEqual({ ok: false, value: 102 });
  });

  it("should allow admin to change role", () => {
    contract.registerUser(accounts.company, "company", "Test", "Desc");
    const result = contract.changeRole(accounts.deployer, accounts.company, "facility");
    expect(result).toEqual({ ok: true, value: true });

    const userInfo = contract.getUserInfo(accounts.company);
    expect(userInfo).toEqual({
      ok: true,
      value: expect.objectContaining({ role: "facility" }),
    });

    expect(contract.getRoleCount("company")).toEqual({ ok: true, value: 0 });
    expect(contract.getRoleCount("facility")).toEqual({ ok: true, value: 1 });
  });

  it("should prevent role change to invalid role", () => {
    contract.registerUser(accounts.company, "company", "Test", "Desc");
    const result = contract.changeRole(accounts.deployer, accounts.company, "invalid");
    expect(result).toEqual({ ok: false, value: 103 });
  });

  it("should allow admin to pause and unpause contract", () => {
    let result = contract.pauseContract(accounts.deployer);
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: true });

    result = contract.registerUser(accounts.company, "company", "Test", "Desc");
    expect(result).toEqual({ ok: false, value: 107 });

    result = contract.unpauseContract(accounts.deployer);
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: false });
  });

  it("should prevent non-admin from pausing", () => {
    const result = contract.pauseContract(accounts.user);
    expect(result).toEqual({ ok: false, value: 102 });
  });

  it("should allow admin to set new admin", () => {
    const result = contract.setAdmin(accounts.deployer, accounts.user);
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.getContractAdmin()).toEqual({ ok: true, value: accounts.user });
  });

  it("should check if user has role correctly", () => {
    contract.registerUser(accounts.company, "company", "Test", "Desc");
    contract.verifyUser(accounts.deployer, accounts.company);

    let hasRole = contract.hasRole(accounts.company, "company");
    expect(hasRole).toEqual({ ok: true, value: true });

    hasRole = contract.hasRole(accounts.company, "facility");
    expect(hasRole).toEqual({ ok: true, value: false });
  });

  it("should return false for hasRole if not verified or inactive", () => {
    contract.registerUser(accounts.company, "company", "Test", "Desc");

    let hasRole = contract.hasRole(accounts.company, "company");
    expect(hasRole).toEqual({ ok: true, value: false }); // Not verified

    contract.verifyUser(accounts.deployer, accounts.company);
    hasRole = contract.hasRole(accounts.company, "company");
    expect(hasRole).toEqual({ ok: true, value: true });

    contract.deactivateUser(accounts.deployer, accounts.company);
    hasRole = contract.hasRole(accounts.company, "company");
    expect(hasRole).toEqual({ ok: true, value: false });
  });
});