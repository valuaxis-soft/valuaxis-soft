async function main() {
  console.log(
    "Seed temporal: no se insertaron datos. Los seeds se crearan junto con los catalogos PostgreSQL.",
  );
}

main().catch((error) => {
  console.error("Seed temporal fallo:", error);
  process.exit(1);
});
